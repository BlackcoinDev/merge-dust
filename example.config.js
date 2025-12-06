export default {
  host: 'localhost',
  port: 15715,
  user: 'your_username',
  pass: 'your_password',
  rpcwallet: 'DevFundSwapping',  // Add your wallet name here, make sure it is loaded
  dustThreshold: 6000,
  intervalMinutes: 0  // Set to 0 to run once, or specify minutes between runs (e.g., 60 for hourly)
};
