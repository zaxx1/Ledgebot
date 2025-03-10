import fs from 'fs/promises';
import axios from "axios";
import chalk from 'chalk';
import ora from 'ora';
import { Wallet } from "ethers";
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';

function delay(seconds) {
  return new Promise(resolve => setTimeout(resolve, seconds * 1000));
 }

function generateSessionId(length = 8) {
  let result = '';
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const charactersLength = characters.length;
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}

class RequestHandler {
  static async makeRequest(config, retries = 30, backoffMs = 2000) {
    for (let i = 0; i < retries; i++) {
      try {
        const response = await axios(config);
        return response;
      } catch (error) {
        const isLastRetry = i === retries - 1;
        const status = error.response?.status;
        if (status === 500) {
          if (isLastRetry) break;
          const waitTime = backoffMs * Math.pow(1.5, i);
          await delay(waitTime / 1000);
          continue;
        }
        if (isLastRetry) return null;
        await delay(2);
      }
    }
    return null;
  }
}

async function readFile(pathFile) {
  try {
    const datas = await fs.readFile(pathFile, 'utf8');
    return datas.split('\n')
      .map(data => data.trim())
      .filter(data => data.length > 0);
  } catch (error) {
    console.log(chalk.red(`Error reading file: ${error.message}`));
    return [];
  }
}

const newAgent = (proxy = null) => {
  if (proxy) {
    if (proxy.startsWith('http://')) {
      return new HttpsProxyAgent(proxy);
    } else if (proxy.startsWith('socks4://') || proxy.startsWith('socks5://')) {
      return new SocksProxyAgent(proxy);
    } else {
      console.log(chalk.red(`Unsupported proxy type: ${proxy}`));
      return null;
    }
  }
  return null;
};

class LayerEdgeConnection {
  constructor(proxy = null, privateKey = null, refCode = "knYyWnsE") {
    this.refCode = refCode;
    this.proxy = proxy;
    this.retryCount = 30;
    this.headers = {
      'Accept': 'application/json, text/plain, */*',
      'Accept-Encoding': 'gzip, deflate, br',
      'Accept-Language': 'en-US,en;q=0.9',
      'Origin': 'https://layeredge.io',
      'Referer': 'https://layeredge.io/',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-site',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      'sec-ch-ua': '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"'
    };

    this.axiosConfig = {
      ...(this.proxy && { httpsAgent: newAgent(this.proxy) }),
      timeout: 60000,
      headers: this.headers,
      validateStatus: (status) => status < 500
    };

    this.wallet = privateKey
      ? new Wallet(privateKey)
      : Wallet.createRandom();
  }

  async makeRequest(method, url, config = {}) {
    const finalConfig = {
      method,
      url,
      ...this.axiosConfig,
      ...config,
      headers: {
        ...this.headers,
        ...(config.headers || {})
      }
    };
    return await RequestHandler.makeRequest(finalConfig, this.retryCount);
  }

  // Fungsi untuk mendapatkan public IP yang terlihat
  async getPublicIP() {
    try {
      const response = await this.makeRequest("get", "https://api.ipify.org?format=json", { timeout: 10000 });
      if (response && response.data && response.data.ip) {
        return response.data.ip;
      } else {
        return "IP tidak ditemukan";
      }
    } catch (error) {
      return "Error mengambil IP";
    }
  }

  async dailyCheckIn() {
    try {
      const timestamp = Date.now();
      const message = `I am claiming my daily node point for ${this.wallet.address} at ${timestamp}`;
      const sign = await this.wallet.signMessage(message);
      const dataSign = { sign, timestamp, walletAddress: this.wallet.address };
      const config = { data: dataSign, headers: { 'Content-Type': 'application/json' } };

      const response = await this.makeRequest("post", "https://referralapi.layeredge.io/api/light-node/claim-node-points", config);
      if (response && response.data) {
        if (response.data.statusCode && response.data.statusCode === 405) {
          const cooldownMatch = response.data.message.match(/after\s+([^!]+)!/);
          const cooldownTime = cooldownMatch ? cooldownMatch[1].trim() : "unknown time";
          return { status: 'warn', message: `Already checked in: wait ${cooldownTime}` };
        } else {
          return { status: 'success', message: "Daily check-in successful" };
        }
      } else {
        return { status: 'error', message: "Daily check-in failed" };
      }
    } catch (error) {
      return { status: 'error', message: "Error during daily check-in" };
    }
  }

 async submitProof() {
     try {
       const timestamp = new Date().toISOString();
       const message = `I am submitting a proof for LayerEdge at ${timestamp}`;
       const signature = await this.wallet.signMessage(message);
       const proofData = {
       proof: "Hello Edgeess i want Submit my Proof",
       signature,
       message,
      walletAddress: this.wallet.address
    };
    const config = {
      data: proofData,
      headers: { 'Content-Type': 'application/json', 'Accept': '*/*' }
    };
    const response = await this.makeRequest("post", "https://referralapi.layeredge.io/api/card/submit-proof", config);
    if (response && response.data && response.data.success) {
      return { status: 'success', message: response.data.message };
    } else {
      const errMsg = response && response.data && response.data.message
        ? response.data.message
        : "Server Busy 504..";
      return { status: 'error', message: `Proof submission failed: ${errMsg}` };
    }
  } catch (error) {
    return { status: 'error', message: `Error submitting proof: ${error.message}` };
  }
}

  async claimProofSubmissionPoints() {
    try {
      const timestamp = Date.now();
      const message = `I am claiming my proof submission node points for ${this.wallet.address} at ${timestamp}`;
      const sign = await this.wallet.signMessage(message);
      const claimData = { walletAddress: this.wallet.address, timestamp, sign };
      const config = { data: claimData, headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/plain, */*' } };
      const response = await this.makeRequest("post", "https://referralapi.layeredge.io/api/task/proof-submission", config);
      if (response && response.data) {
        if (response.data.message === "proof submission task completed successfully") {
          return { status: 'success', message: "Proof points claimed" };
        } else {
          return { status: 'error', message: `Failed to claim proof points: ${response.data.message}` };
        }
      } else {
        return { status: 'error', message: "Failed to claim proof points: No response data" };
      }
    } catch (error) {
      return { status: 'error', message: `Error claiming proof points: ${error.message}` };
    }
  }

  async checkNodeStatus() {
    const response = await this.makeRequest("get", `https://referralapi.layeredge.io/api/light-node/node-status/${this.wallet.address}`);
    if (response && response.data && response.data.data.startTimestamp !== null) {
      return { status: 'success', message: "Node running" };
    } else {
      return { status: 'warn', message: "Node not running" };
    }
  }

  async stopNode() {
    const timestamp = Date.now();
    const message = `Node deactivation request for ${this.wallet.address} at ${timestamp}`;
    const sign = await this.wallet.signMessage(message);
    const dataSign = { sign, timestamp };
    const response = await this.makeRequest("post", `https://referralapi.layeredge.io/api/light-node/node-action/${this.wallet.address}/stop`, { data: dataSign });
    return response && response.data
      ? { status: 'success', message: "Node stopped" }
      : { status: 'error', message: "Failed to stop node" };
  }

  async connectNode() {
    const timestamp = Date.now();
    const message = `Node activation request for ${this.wallet.address} at ${timestamp}`;
    const sign = await this.wallet.signMessage(message);
    const dataSign = { sign, timestamp };
    const config = { data: dataSign, headers: { 'Content-Type': 'application/json' } };
    const response = await this.makeRequest("post", `https://referralapi.layeredge.io/api/light-node/node-action/${this.wallet.address}/start`, config);
    return response && response.data && response.data.message === "node action executed successfully"
      ? { status: 'success', message: "Node connected" }
      : { status: 'error', message: "Failed to connect node" };
  }

  async claimLightNodePoints() {
    try {
      const timestamp = Date.now();
      const message = `I am claiming my light node run task node points for ${this.wallet.address} at ${timestamp}`;
      const sign = await this.wallet.signMessage(message);
      const claimData = { walletAddress: this.wallet.address, timestamp, sign };
      const config = { data: claimData, headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/plain, */*' } };
      const response = await this.makeRequest("post", "https://referralapi.layeredge.io/api/task/node-points", config);
      if (response && response.data) {
        if (response.data.message === "node points task completed successfully") {
          return { status: 'success', message: "Light node points claimed" };
        } else {
          return { status: 'error', message: `Failed to claim light node points: ${response.data.message}` };
        }
      } else {
        return { status: 'error', message: "Failed to claim light node points: No response data" };
      }
    } catch (error) {
      return { status: 'error', message: `Error claiming light node points: ${error.message}` };
    }
  }

  async checkNodePoints() {
    const response = await this.makeRequest("get", `https://referralapi.layeredge.io/api/referral/wallet-details/${this.wallet.address}`);
    if (response && response.data) {
      return { status: 'success', message: `Total Points: ${response.data.data?.nodePoints || 0}` };
    } else {
      return { status: 'error', message: "Failed to check total points" };
    }
  }
}

async function readWallets() {
  try {
    await fs.access("config.json");
    const data = await fs.readFile("config.json", "utf-8");
    return JSON.parse(data);
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.log(chalk.yellow("No wallets found in config.json"));
      return [];
    }
    throw err;
  }
}

async function processWallet(wallet, proxy, walletIndex, totalWallets) {
  const { address, privateKey } = wallet;
  console.log(chalk.bold.cyanBright('='.repeat(80)));
  console.log(chalk.bold.whiteBright(`Wallet : ${walletIndex + 1}/${totalWallets}`));
  console.log(chalk.bold.whiteBright(`Starting Wallet : ${address}`));
  console.log(chalk.bold.whiteBright(`Proxy: ${proxy}`));

  let proxyForWallet = null;
  if (proxy !== 'None') {
    const sessionId = generateSessionId();
    proxyForWallet = proxy.includes('?')
      ? `${proxy}&session=${sessionId}`
      : `${proxy}?session=${sessionId}`;
    console.log(chalk.bold.whiteBright(`Generated Session ID: ${sessionId}`));
  }

  const socket = new LayerEdgeConnection(proxyForWallet, privateKey);
  const usedIP = await socket.getPublicIP();
  console.log(chalk.bold.whiteBright(`IP: ${usedIP}`));
  console.log(chalk.bold.cyanBright('='.repeat(80)));

  const spinnerDaily = ora({ text: `Checking Daily Check-In...`, spinner: 'dots2', color: 'cyan' }).start();
  const daily = await socket.dailyCheckIn();
  if (daily.status === 'success') {
    spinnerDaily.succeed(chalk.bold.greenBright(` ${daily.message}`));
  } else if (daily.status === 'warn') {
    spinnerDaily.warn(chalk.bold.yellowBright(` ${daily.message}`));
  } else {
    spinnerDaily.fail(chalk.bold.redBright(` ${daily.message}`));
  }

  const spinnerProof = ora({ text: `Submitting Proof...`, spinner: 'dots2', color: 'cyan' }).start();
  const proofTimeoutMs = 5 * 60 * 1000;
  const submitProofPromise = socket.submitProof();
  const proofTimeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error("Submitting proof timed out")), proofTimeoutMs)
  );
  let proof;
  try {
    proof = await Promise.race([submitProofPromise, proofTimeout]);
    if (proof.status === 'success') {
      spinnerProof.succeed(chalk.bold.greenBright(` Proof Submitted - ${proof.message}`));
    } else {
      spinnerProof.fail(chalk.bold.redBright(` ${proof.message}`));
    }
  } catch (error) {
    spinnerProof.fail(chalk.bold.redBright(` ${error.message}`));
    proof = { status: 'error', message: error.message };
  }

  const spinnerClaimProof = ora({ text: `Claiming Proof Points...`, spinner: 'dots2', color: 'cyan' }).start();
  const claimProofTimeoutMs = 5 * 60 * 1000;
  const claimProofPromise = socket.claimProofSubmissionPoints();
  const claimProofTimeout = new Promise((_, reject) =>
  setTimeout(() => reject(new Error("Claiming proof points timed out")), claimProofTimeoutMs)
 );

 try {
  const claimProofResult = await Promise.race([claimProofPromise, claimProofTimeout]);
  if (claimProofResult.status === 'success') {
    spinnerClaimProof.succeed(chalk.bold.greenBright(` Proof Points Claimed - ${claimProofResult.message}`));
  } else {
    spinnerClaimProof.fail(chalk.bold.redBright(` ${claimProofResult.message}`));
  }
 } catch (error) {
  spinnerClaimProof.fail(chalk.bold.redBright(` ${error.message}`));
}


  const spinnerNode = ora({ text: "Checking Node Status...", spinner: 'dots2', color: 'cyan' }).start();
  const nodeStatus = await socket.checkNodeStatus();
  if (nodeStatus.status === 'success') {
    const stop = await socket.stopNode();
    spinnerNode.text = chalk.bold.redBright(` Stop Node: ${stop.message}`);
  } else {
    spinnerNode.text = chalk.bold.greenBright(` Status Node: ${nodeStatus.message}`);
  }

  const connect = await socket.connectNode();
  spinnerNode.text = chalk.bold.greenBright(` Status Node: ${connect.message}`);
  spinnerNode.succeed();

  const spinnerLightNode = ora({ text: `Claiming Light Node Points...`, spinner: 'dots2', color: 'cyan' }).start();
  const lightNode = await socket.claimLightNodePoints();
  if (lightNode.status === 'success') {
    spinnerLightNode.succeed(chalk.bold.greenBright(` Light Node Points Claimed - ${lightNode.message}`));
  } else {
    spinnerLightNode.fail(chalk.bold.redBright(` ${lightNode.message}`));
  }

  const spinnerTotalPoints = ora({ text: `Checking Total Points...`, spinner: 'dots2', color: 'cyan' }).start();
  const totalPoints = await socket.checkNodePoints();
  if (totalPoints.status === 'success') {
    spinnerTotalPoints.succeed(chalk.bold.cyanBright(` ${totalPoints.message}`));
  } else {
    spinnerTotalPoints.fail(chalk.bold.redBright(` ${totalPoints.message}`));
  }

  ora().succeed(chalk.bold.blueBright(` Wallet Processing Complete.`));
  console.log(chalk.bold.cyanBright('='.repeat(80)));
  console.log(`\n`);
}

async function run() {
  console.log(chalk.cyan('Starting Layer Edge Auto Bot...'));

  const proxies = await readFile('proxy.txt');
  if (proxies.length === 0) {
    console.log(chalk.yellow('No Proxies - Running without proxy support'));
  }

  const wallets = await readWallets();
  console.log(chalk.cyan(`Configuration loaded - Wallets: ${wallets.length}, Proxies: ${proxies.length} \n`));

  for (let i = 0; i < wallets.length; i++) {
    const proxy = proxies[i % proxies.length] || 'None';
    try {
      await processWallet(wallets[i], proxy, i, wallets.length);
    } catch (err) {
      console.log(chalk.red(`Processing wallet ${i + 1} encountered an error: ${err.message}`));
    }
  }

  console.log(chalk.blue('Cycle complete. Waiting 12 hour before next run...'));
  await delay(720 * 60);
  run();
}

run();
