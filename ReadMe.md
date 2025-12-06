**Node.js script to merge dust UTXOs.**

* This script finds all unspent UTXOs, sorts them by address.
* It selects an address with two or more dust inputs (configurable threshold).
* It builds a transaction with up to 677 UTXOs from the selected address.
* The script sends the transaction and displays the transaction ID.
* Can run once or continuously with configurable intervals.
* WARNING: This is done without user intervention!

## Requirements

* Node.js LTS (20.x or later, use nvm if possible)
* Blackcoin More v26.2.0 or later RPC server

## Setup

1. Copy example.config.js to config.js

```bash
cp example.config.js config.js
```

2. Update config.js with your settings:
   * `host`: RPC server host (default: localhost)
   * `port`: RPC server port (default: 15715)
   * `user`: RPC username
   * `pass`: RPC password
   * `rpcwallet`: Your wallet name (check ~/.blackmore/wallets/ for mainnet or ~/.blackmore/testnet/wallets/ for testnet)
   * `dustThreshold`: Maximum satoshi value to consider as dust (default: 6000)
   * `intervalMinutes`: How often to check for dust UTXOs
     * Set to `0` to run once and exit
     * Set to `60` to run every hour
     * Set to `1440` to run once daily

3. Ensure your wallet is loaded and unlocked before running the script

4. Make sure your blackmore.conf has at least:

```
server=1
daemon=1
rpcuser=yourusername
rpcpassword=yourpassword
```

## How to run

Install dependencies:

```bash
npm install
```

Run once:

```bash
npm run start
# or
node index.js
```

## Continuous Mode

Set `intervalMinutes` in config.js to enable continuous monitoring:

```javascript
intervalMinutes: 60  // Check every hour
```

When running in continuous mode:
* The script will run immediately on startup
* It displays a countdown timer showing when the next check will run
* The timer updates every 10 seconds
* Press Ctrl+C to stop the script

## Example Output

```
Continuous mode enabled. Will check for dust UTXOs every 60 minutes.
Press Ctrl+C to stop.

Searching for Addresses with UTXOs with amount less than or equal to 6000
Found 345 total UTXOs
Address BKDvboD1CzZ5KycP1FRSXRoi7XXhHoQhS1 has 42 dust UTXOs
Found 1 addresses with multiple dust UTXOs
Selecting from 42 dust UTXOs for address: BKDvboD1CzZ5KycP1FRSXRoi7XXhHoQhS1
Selected 42 UTXOs, total input amount: 939000000 sat (9.39 BLK)
[12/6/2025, 2:30:45 PM] Next check in 0h 59m 50s
[12/6/2025, 2:30:55 PM] Next check in 0h 59m 40s
```

## Troubleshooting

* **"Wallet is locked" error**: Unlock your wallet with:

```bash
blackmore-cli -rpcwallet=YourWalletName walletpassphrase "your-passphrase" 300
```

* **No dust found**: Adjust the `dustThreshold` in config.js to a higher value

* **Script stops**: Check that your RPC credentials are correct and the wallet is loaded

## How the Script Works

1. **Fetches UTXOs**: Retrieves all unspent transaction outputs from your wallet via RPC
2. **Groups by address**: Organizes UTXOs by their addresses
3. **Identifies dust**: Finds addresses with multiple UTXOs below the dust threshold
4. **Selects UTXOs**: Picks up to 677 dust UTXOs from the address with the most dust
5. **Calculates fees**: Creates a transaction to estimate size and calculates transaction fees (100 sat/byte + 100 sat minimum)
6. **Adjusts amount**: Recreates the transaction with the calculated fee deducted from the output
7. **Signs & sends**: Signs the transaction with your wallet's private key and broadcasts it
8. **Displays TXID**: Shows the transaction ID upon successful broadcast

## Important Notes

* **Wallet must be loaded**: Ensure your wallet specified in `rpcwallet` is loaded in the Blackcoin daemon
* **Wallet must be unlocked**: For signing transactions, your wallet must be unlocked (see Troubleshooting)
* **Automatic execution**: The script sends transactions without user confirmation
* **RPC connection**: Requires an RPC connection to the Blackcoin More daemon on the configured host and port
* **Maximum UTXOs per transaction**: Limited to 677 UTXOs per transaction (blockchain limitation)

## Configuration Limits

* `dustThreshold`: Can be any positive integer in satoshis
  * Recommended range: 600 to 100,000,000 satoshis
  * Each satoshi = 0.00000001 BLK
* `intervalMinutes`: Can be any positive integer or 0
  * Practical minimum: 5 minutes (for testing)
  * Recommended for production: 60+ minutes

## Deployment

You can run this script as a background service or schedule it with cron:

```bash
# Run every hour via cron
0 * * * * cd /path/to/merge-dust && npm run start
```

Or use a process manager like PM2:

```bash
pm2 start index.js --name merge-dust
```
