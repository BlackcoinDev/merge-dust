**Node js script to merge dust UTXOs.**

* This script will find all unspent UTXOs, and sort them by address.
* It will then prompt you with a list of the found addresses.
* Select one of the addresses, and the script will begin building a transaction with UTXOs from the selected address.  It will select up to 300 UTXOs at a time.
* Once a transaction is built, the script will show a summary of amount, fee, and send to address, with an option to send the transaction or cancel.

**Requirements**
  * Node JS
  * Blackcoin RPC server

**How to run**

Enter RPC host, port, user, and pass in config.js.

run `npm install`

run `node index.js`
