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

async function mergeDustUTXOs() {
  let dustAmount;

  dustAmount = Number(clientConfig.dustThreshold || 6000);

  if (Object.is(dustAmount, NaN)) {
    console.log('Please enter a whole number between 90000000 and 100000000');
    process.exit(1);
  }

  if (dustAmount > 100000000) {
    console.log(`Whole Blackcoins are not dust.  Value entered was: ${dustAmount / 100000000} BLK`);
    process.exit(1);
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
     return;
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
    return;
  }

  const addresses = addressesWithDust[0];

  const selectedDustArray = sortedByAddress[addresses];

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
    console.error('Error creating raw transaction:', err.message);
    process.exit(1);
  });
  let signedTxn = await signRawTxn(rawTxn).catch((err) => {
    console.error('Error signing transaction:', err.message);
    if (err.code === -13) {
      console.error('Hint: Wallet is locked. Unlock with: blackmore-cli -rpcwallet=' + clientConfig.rpcwallet + ' walletpassphrase "<passphrase>" 300');
    }
    process.exit(1);
  });
  let decoded = await decodeRawTxn(signedTxn.hex).catch((err) => {
    console.error('Error decoding transaction:', err.message);
    process.exit(1);
  });
   // Calculate fee based on signed txn size
   //
   console.log('Txn size: ', decoded.size);
   fee = (decoded.size * 100) + 100;
   console.log(`Calculated Fee: ${fee} sat (${fee / 100000000} BLK)`);
   sendAmount = (total - fee) / 100000000;
   console.log(`Final send amount: ${sendAmount} BLK`);

   // Recreate the txn with the approved fee
   //
   send[addresses] = sendAmount;
   rawTxn = await createRawTxn(selectedUtxos, send).catch((err) => {
     console.error('Error recreating raw transaction:', err.message);
     process.exit(1);
   });
   signedTxn = await signRawTxn(rawTxn).catch((err) => {
     console.error('Error signing transaction:', err.message);
     if (err.code === -13) {
       console.error('Hint: Wallet is locked. Unlock with: blackmore-cli -rpcwallet=' + clientConfig.rpcwallet + ' walletpassphrase "<passphrase>" 300');
     }
     process.exit(1);
   });
   decoded = await decodeRawTxn(signedTxn.hex).catch((err) => {
     console.error('Error decoding final transaction:', err.message);
     process.exit(1);
   });
   console.log(`Final txn size: ${decoded.size}`);
   // Send the transaction
   //
   const txid = await sendRawTxn(signedTxn.hex).catch((err) => {
     console.error('Error sending transaction:', err.message);
     process.exit(1);
   });
   console.log('Transaction sent successfully! TXID:', txid);
}

async function main() {
  const intervalMinutes = clientConfig.intervalMinutes || 0;
  
  if (intervalMinutes > 0) {
    console.log(`Continuous mode enabled. Will check for dust UTXOs every ${intervalMinutes} minutes.`);
    console.log('Press Ctrl+C to stop.\n');
    
    // Run immediately on startup
    await mergeDustUTXOs().catch(err => console.error('Error during dust merge:', err.message));
    
    let nextRunTime = new Date(Date.now() + intervalMinutes * 60 * 1000);
    
    // Show countdown every 10 seconds, updating the same line
    const countdownInterval = setInterval(() => {
      const now = new Date();
      const diff = nextRunTime - now;
      
      if (diff > 0) {
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        process.stdout.write(`\r[${now.toLocaleString()}] Next check in ${hours}h ${minutes}m ${seconds}s`);
      }
    }, 10000);
    
    // Then run on interval
    setInterval(async () => {
      console.log(`\n--- Running dust merge at ${new Date().toLocaleString()} ---`);
      await mergeDustUTXOs().catch(err => console.error('Error during dust merge:', err.message));
      nextRunTime = new Date(Date.now() + intervalMinutes * 60 * 1000);
    }, intervalMinutes * 60 * 1000);
  } else {
    // Run once and exit
    await mergeDustUTXOs();
  }
}

main().catch(err => console.log(err));
