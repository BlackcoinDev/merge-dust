**Node.js script to merge dust UTXOs.**

* This script finds all unspent UTXOs, sorts them by address.
* It selects an address with two or more dust inputs (30000000 satoshis or smaller).
* It builds a transaction with up to 677 UTXOs from the selected address.
* The script sends the transaction and displays the transaction ID.

**Requirements**

* Node.js LTS (20.x or later, use nvm if possible)
* Blackcoin More v26.2.0 or later RPC server

* Copy example.config.js to config.js
* Update host, port, user, pass, and rpcwallet in config.js
* Set rpcwallet to your wallet name (check ~/.blackmore/wallets/ for mainnet or ~/.blackmore/testnet/wallets/ for testnet)

If no rpcport is defined in blackmore.conf, it defaults to 15715 on localhost.

Ensure user and pass match between config.js and blackmore.conf.

Add at least the following to blackmore.conf:
server=1
daemon=1
rpcuser=yourusername
rpcpassword=yourpassword

**How to run**

run `npm install`

run `node index.js`

You can script index.js or add it to a cron scheduler.