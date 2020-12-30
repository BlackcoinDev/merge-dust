**Node js script to merge dust UTXOs.**

* This script will find all unspent UTXOs, and sort them by address.
* It will select an address containing two or more dust inputs (6000 blacktoshi and smaller)
* and the script will begin building a transaction with UTXOs from automatically choosen address.  It will select up to 677 UTXOs at a time.
* Once a transaction is built, the script will send the transactions and will show the transaction ID.

**Requirements**

* Node JS - 12.x (use nvm if possible)
* Blackcoin More v2.13.2.7 RPC server

* Copy the example.config.js file to config.js 
* Change RPC host, port, user, and pass in config.js file

If no rpcport is defined in the blackmore.conf file, by default it will use RPC 15715 on localhost (127.0.0.1)

Make sure the user and pass info matches between config.js file and blackmore.conf file

You need to add at least the following info to the blackmore.conf file
server=1
daemon=1
rpcuser=dontusethisuser
rpcpassword=dontusethispass

**How to run**

run `npm install`

run `node index.js`

You may script index.js, or add it to a cron-like scheduler.