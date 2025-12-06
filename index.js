import { Client } from "node-blackcoin-more";

import clientConfig from './config.js';

// Validate that all required configuration values are present
if (!clientConfig.user || !clientConfig.pass || !clientConfig.host || !clientConfig.port || !clientConfig.rpcwallet) {
  console.log(`Config is missing values. Make sure host, port, user, pass, and rpcwallet are filled in.`);
  process.exit(0);
}

// Initialize RPC client with configuration
const client = new Client(clientConfig);

// Construct the wallet path for RPC calls (required by Blackcoin More)
const walletPath = `/wallet/${clientConfig.rpcwallet}`;

/**
 * Fetch all unspent transaction outputs (UTXOs) from the wallet
 * @returns {Promise<Array>} Array of UTXO objects
 */
function getUnspent() {
  return new Promise((resolve, reject) => {
    client.rpc.call('listunspent', [], function(data){
      resolve(data);
    }, reject, walletPath);
  });
}

/**
 * Create a raw transaction from selected UTXOs
 * @param {Array} utxos - Array of {txid, vout} objects to spend
 * @param {Object} output - Object with address as key and amount (in BLK) as value
 * @returns {Promise<String>} Raw transaction hex string
 */
function createRawTxn(utxos, output) {
  return new Promise((resolve, reject) => {
    client.rpc.call('createrawtransaction', [utxos, output], function(data){
      resolve(data);
    }, reject, walletPath);
  });
}

/**
 * Decode a raw transaction to inspect its properties (size, inputs, outputs)
 * @param {String} raw - Raw transaction hex string
 * @returns {Promise<Object>} Decoded transaction object
 */
function decodeRawTxn(raw) {
  return new Promise((resolve, reject) => {
    client.rpc.call('decoderawtransaction', [raw], function(data){
      resolve(data);
    }, reject, walletPath);
  });
}

/**
 * Sign a raw transaction with the wallet's private keys
 * @param {String} raw - Raw transaction hex string
 * @returns {Promise<Object>} Signed transaction object with hex property
 */
function signRawTxn(raw) {
  return new Promise((resolve, reject) => {
    client.rpc.call('signrawtransactionwithwallet', [raw], function(data){
      resolve(data);
    }, reject, walletPath);
  });
}

/**
 * Broadcast a signed transaction to the network
 * @param {String} raw - Signed transaction hex string
 * @returns {Promise<String>} Transaction ID (TXID)
 */
function sendRawTxn(raw) {
  return new Promise((resolve, reject) => {
    client.rpc.call('sendrawtransaction', [raw], function(data){
      resolve(data);
    }, reject, walletPath);
  });
}

/**
 * Main function to find and merge dust UTXOs
 * Performs the following steps:
 * 1. Fetch all UTXOs from wallet
 * 2. Identify dust UTXOs (below threshold)
 * 3. Find addresses with multiple dust UTXOs
 * 4. Create transaction to consolidate dust
 * 5. Calculate fees and adjust output amount
 * 6. Sign and broadcast the transaction
 */
async function mergeDustUTXOs() {
  let dustAmount;

  // Parse dust threshold from config, default to 6000 satoshis if not specified
  dustAmount = Number(clientConfig.dustThreshold || 6000);

  // Validate that dust amount is a valid number
  if (Object.is(dustAmount, NaN)) {
    console.log('Please enter a whole number between 90000000 and 100000000');
    process.exit(1);
  }

  // Prevent attempting to consolidate whole coins as "dust"
  if (dustAmount > 100000000) {
    console.log(`Whole Blackcoins are not dust.  Value entered was: ${dustAmount / 100000000} BLK`);
    process.exit(1);
  }

   // Step 1: Fetch all UTXOs and sort by address
   console.log(`Searching for Addresses with UTXOs with amount less than or equal to ${dustAmount}`);
   let addressesWithDust = [];
   const list = await getUnspent();
   console.log(`Found ${list.length} total UTXOs`);
   
   // Group UTXOs by address and identify which addresses have dust
   const sortedByAddress = list.reduce( (accumulator, utxo) => {
     const address = utxo.address;
     const amount = utxo.amount * 100000000; // Convert BLK to satoshis
     
     // Track addresses that have at least one dust UTXO
     if (amount <= dustAmount && !addressesWithDust.includes(address)) {
       addressesWithDust.push(address);
     }
     
     // Group UTXOs by address
     if (!accumulator[address]) {
       accumulator[address] = [];
     }
     accumulator[address].push(utxo);
     return accumulator;
   }, {});

   // No dust found at all
   if (addressesWithDust.length === 0) {
     console.log('No address with dust found.');
     return;
   }

   // Step 2: Filter to only addresses with MULTIPLE dust UTXOs
   // We need at least 2 dust UTXOs to make consolidation worthwhile
   addressesWithDust = [];
   for (const address in sortedByAddress) {
     const utxoArray = sortedByAddress[address];
     
     // Filter this address's UTXOs to only include dust
     const dustArray = utxoArray.filter( utxo => {
       const amount = utxo.amount * 100000000;
       if ( amount <= dustAmount ) return utxo;
     });
     
     console.log(`Address ${address} has ${dustArray.length} dust UTXOs`);
     
     // Keep only addresses with 2+ dust UTXOs
     if (dustArray.length > 1) {
       sortedByAddress[address] = dustArray;
       addressesWithDust.push(address);
     } else {
       delete sortedByAddress[address];
     }
   }

   console.log(`Found ${addressesWithDust.length} addresses with multiple dust UTXOs`);

  // No addresses with multiple dust UTXOs to consolidate
  if (addressesWithDust.length === 0) {
    console.log('No addresses with multiple dust UTXOs found.');
    return;
  }

  // Step 3: Select the first address with multiple dust UTXOs
  const addresses = addressesWithDust[0];
  const selectedDustArray = sortedByAddress[addresses];

  const selectedUtxos = [];
  let fee = 0;
  let total = 0;

  // Step 4: Select up to 677 dust UTXOs (blockchain transaction limit)
  // Maximum number of UTXOs that can fit in a single transaction
  let MaxNumUtxos = 677;

   console.log(`Selecting from ${selectedDustArray.length} dust UTXOs for address: ${addresses}`);
   
   // Pop UTXOs from the array and build transaction input list
   while (selectedUtxos.length < MaxNumUtxos && selectedDustArray.length > 0) {
     const utxo = selectedDustArray.pop();
     const amount = utxo.amount * 100000000; // Convert to satoshis
     
     // Add to transaction inputs (txid and vout index)
     selectedUtxos.push({txid: utxo.txid, vout: utxo.vout});
     total = total + amount;
   }
   console.log(`Selected ${selectedUtxos.length} UTXOs, total input amount: ${total} sat (${total / 100000000} BLK)`);

   // Step 5: Create initial transaction to estimate fees
   console.log(`Creating txn to send ${selectedUtxos.length} UTXOs to ${addresses}`);
   
   const send = {};
   let sendAmount = (total - fee) / 100000000; // Convert satoshis back to BLK
   send[addresses] = sendAmount;
   console.log(`Initial send amount (before fee calc): ${sendAmount} BLK`);
   
  // Create raw transaction
  let rawTxn = await createRawTxn(selectedUtxos, send).catch((err) => {
    console.error('Error creating raw transaction:', err.message);
    process.exit(1);
  });
  
  // Sign the transaction to get the final size (signatures add bytes)
  let signedTxn = await signRawTxn(rawTxn).catch((err) => {
    console.error('Error signing transaction:', err.message);
    if (err.code === -13) {
      console.error('Hint: Wallet is locked. Unlock with: blackmore-cli -rpcwallet=' + clientConfig.rpcwallet + ' walletpassphrase "<passphrase>" 300');
    }
    process.exit(1);
  });
  
  // Decode to get transaction size in bytes
  let decoded = await decodeRawTxn(signedTxn.hex).catch((err) => {
    console.error('Error decoding transaction:', err.message);
    process.exit(1);
  });
  
   // Step 6: Calculate fee based on signed transaction size
   // Fee calculation: 100 satoshis per byte + 100 satoshi minimum
   console.log('Txn size: ', decoded.size);
   fee = (decoded.size * 100) + 100;
   console.log(`Calculated Fee: ${fee} sat (${fee / 100000000} BLK)`);
   
   // Adjust output amount to account for fees
   sendAmount = (total - fee) / 100000000;
   console.log(`Final send amount: ${sendAmount} BLK`);

   // Step 7: Recreate the transaction with the corrected fee
   send[addresses] = sendAmount;
   rawTxn = await createRawTxn(selectedUtxos, send).catch((err) => {
     console.error('Error recreating raw transaction:', err.message);
     process.exit(1);
   });
   
   // Sign the corrected transaction
   signedTxn = await signRawTxn(rawTxn).catch((err) => {
     console.error('Error signing transaction:', err.message);
     if (err.code === -13) {
       console.error('Hint: Wallet is locked. Unlock with: blackmore-cli -rpcwallet=' + clientConfig.rpcwallet + ' walletpassphrase "<passphrase>" 300');
     }
     process.exit(1);
   });
   
   // Decode final transaction to verify size
   decoded = await decodeRawTxn(signedTxn.hex).catch((err) => {
     console.error('Error decoding final transaction:', err.message);
     process.exit(1);
   });
   console.log(`Final txn size: ${decoded.size}`);
   
   // Step 8: Broadcast the transaction to the network
   const txid = await sendRawTxn(signedTxn.hex).catch((err) => {
     console.error('Error sending transaction:', err.message);
     process.exit(1);
   });
   console.log('Transaction sent successfully! TXID:', txid);
}

/**
 * Main entry point - handles continuous mode or single run
 */
async function main() {
  const intervalMinutes = clientConfig.intervalMinutes || 0;
  
  if (intervalMinutes > 0) {
    // Continuous mode: run repeatedly at specified interval
    console.log(`Continuous mode enabled. Will check for dust UTXOs every ${intervalMinutes} minutes.`);
    console.log('Press Ctrl+C to stop.\n');
    
    // Run immediately on startup
    await mergeDustUTXOs().catch(err => console.error('Error during dust merge:', err.message));
    
    // Calculate next run time
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
    
    // Schedule periodic runs
    setInterval(async () => {
      console.log(`\n--- Running dust merge at ${new Date().toLocaleString()} ---`);
      await mergeDustUTXOs().catch(err => console.error('Error during dust merge:', err.message));
      nextRunTime = new Date(Date.now() + intervalMinutes * 60 * 1000);
    }, intervalMinutes * 60 * 1000);
  } else {
    // Single run mode: execute once and exit
    await mergeDustUTXOs();
  }
}

// Start the application
main().catch(err => console.log(err));
