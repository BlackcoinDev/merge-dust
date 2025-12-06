import { Client } from "node-blackcoin-more";

import clientConfig from './config.js';
if (!clientConfig.user || !clientConfig.pass || !clientConfig.host || !clientConfig.port || !clientConfig.rpcwallet) {
  console.log(`Config is missing values. Make sure host, port, user, pass, and rpcwallet are filled in.`);
  process.exit(0);
}

const client = new Client(clientConfig);
const walletPath = `/wallet/${clientConfig.rpcwallet}`;

function getUnspent() {
  return new Promise((resolve, reject) => {
    client.rpc.call('listunspent', [], function(data){
      resolve(data);
    }, reject, walletPath);
  });
}

function createRawTxn(utxos, output) {
  return new Promise((resolve, reject) => {
    client.rpc.call('createrawtransaction', [utxos, output], function(data){
      resolve(data);
    }, reject, walletPath);
  });
}

function decodeRawTxn(raw) {
  return new Promise((resolve, reject) => {
    client.rpc.call('decoderawtransaction', [raw], function(data){
      resolve(data);
    }, reject, walletPath);
  });
}

function signRawTxn(raw) {
  return new Promise((resolve, reject) => {
    client.rpc.call('signrawtransactionwithwallet', [raw], function(data){
      resolve(data);
    }, reject, walletPath);
  });
}

function sendRawTxn(raw) {
  return new Promise((resolve, reject) => {
    client.rpc.call('sendrawtransaction', [raw], function(data){
      resolve(data);
    }, reject, walletPath);
  });
}

async function main() {
  let dustAmount;
  let sendToAddress;

  dustAmount = Number(clientConfig.dustThreshold || 6000);

  if (Object.is(dustAmount, NaN)) {
    console.log('Please enter a whole number between 90000000 and 100000000');
    process.exit(0);
  }

  if (dustAmount > 100000000) {
    console.log(`Whole Blackcoins are not dust.  Value entered was: ${dustAmount / 100000000} BLK`);
    process.exit(0);
  }

   // sort utxos by address
   //
   console.log(`Searching for Addresses with UTXOs with amount less than or equal to ${dustAmount}`);
   let addressesWithDust = [];
   const list = await getUnspent();
   console.log(`Found ${list.length} total UTXOs`);
   const sortedByAddress = list.reduce( (accumulator, utxo) => {
     const address = utxo.address;
     const amount = utxo.amount * 100000000;
     if (amount <= dustAmount && !addressesWithDust.includes(address)) {
       addressesWithDust.push(address);
     }
     if (!accumulator[address]) {
       accumulator[address] = [];
     }
     accumulator[address].push(utxo);
     return accumulator;
   }, {});

   if (addressesWithDust.length === 0) {
     console.log('No address with dust found.');
     process.exit(0);
   }

   // Remove addresses that only have 1 dust UTXO
   //
   addressesWithDust = [];
   for (const address in sortedByAddress) {
     const utxoArray = sortedByAddress[address];
     const dustArray = utxoArray.filter( utxo => {
       const amount = utxo.amount * 100000000;
       if ( amount <= dustAmount ) return utxo;
     });
     console.log(`Address ${address} has ${dustArray.length} dust UTXOs`);
     if (dustArray.length > 1) {
       sortedByAddress[address] = dustArray;
       addressesWithDust.push(address);
     } else {
       delete sortedByAddress[address];
     }
   }

   console.log(`Found ${addressesWithDust.length} addresses with multiple dust UTXOs`);

  if (addressesWithDust.length === 0) {
    console.log('No addresses with multiple dust UTXOs found.');
    process.exit(0);
  }

  const addresses = addressesWithDust[0];

  const selectedDustArray = sortedByAddress[addresses];

  const confirmAddress = 'Continue'

  if (confirmAddress === 'Cancel') {
    console.log('Aborted by user.');
    process.exit(0);
  }

  const selectedUtxos = [];
  let fee = 0;
  let total = 0;

  // The maximum number of UTXOs that will be included in a transaction
  //
  let MaxNumUtxos = 677;

   console.log(`Selecting from ${selectedDustArray.length} dust UTXOs for address: ${addresses}`);
   while (selectedUtxos.length < MaxNumUtxos && selectedDustArray.length > 0) {
     const utxo =  selectedDustArray.pop();
     const amount = utxo.amount * 100000000;
     selectedUtxos.push({txid: utxo.txid, vout: utxo.vout});
     total = total + amount;
   }
   console.log(`Selected ${selectedUtxos.length} UTXOs, total input amount: ${total} sat (${total / 100000000} BLK)`);

   console.log(`Creating txn to send ${selectedUtxos.length} UTXOs to ${addresses}`);
   const send = {};
   let sendAmount = (total - fee) / 100000000;
   send[addresses] = sendAmount;
   console.log(`Initial send amount (before fee calc): ${sendAmount} BLK`);
  let rawTxn = await createRawTxn(selectedUtxos, send).catch((err) => {
    console.log('createRawTxn', err);
    process.exit(0);
  });
  let signedTxn = await signRawTxn(rawTxn).catch((err) => {
    console.log('signRawTxn',err);
    process.exit(0);
  });
  let decoded = await decodeRawTxn(signedTxn.hex).catch((err) => {
    console.log('decodeRawTxn', err);
    process.exit(0);
  });
   // Calculate fee based on signed txn size
   //
   console.log('Txn size: ', decoded.size);
   fee = (decoded.size * 100) + 100;
   console.log(`Calculated Fee: ${fee} sat (${fee / 100000000} BLK)`);
   sendAmount = (total - fee) / 100000000;
   console.log(`Final send amount: ${sendAmount} BLK`);

 const confirmTxn = 'Send'

  if (confirmTxn === 'Cancel') {
    console.log('Aborted by user.');
    process.exit(0);
  }
   // Recreate the txn with the approved fee
   //
   send[addresses] = sendAmount;
   rawTxn = await createRawTxn(selectedUtxos, send).catch((err) => console.log('createRawTxn', err));
   signedTxn = await signRawTxn(rawTxn).catch((err) => console.log('signRawTxn',err));
   decoded = await decodeRawTxn(signedTxn.hex).catch((err) => console.log('decodeRawTxn', err));
   console.log(`Final txn size: ${decoded.size}`);
   // Send the transaction
   //
   const txid = await sendRawTxn(signedTxn.hex).catch((err) => console.log(err));
   console.log('Transaction sent successfully! TXID:', txid);
}

main().catch(err => console.log(err));
