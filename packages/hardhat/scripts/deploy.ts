import * as hre from "hardhat";
import { ethers } from "hardhat";
import { setTimeout } from "timers/promises";

// Minimal NameWrapper interface for approval
const NAME_WRAPPER_ABI = [
  "function setApprovalForAll(address operator, bool approved) external",
  "function isApprovedForAll(address owner, address operator) external view returns (bool)",
];

async function main() {
  const [signer] = await ethers.getSigners();
  console.log(`Using account: ${signer.address}`);

  // Sepolia ENS addresses
  const SEPOLIA_CONFIG = {
    pyth: "0xDd24F84d36BF92C65F92307595335bdFab5Bbd21",
    nameWrapperAddress: "0x0635513f179D50A207757E05759CbD106d7dFcE8",
    resolverAddress: "0x8FADE66B79cC9f707aB26799354482EB93a5B7dD",
    domain: "tempo.eth",
  };

  // Configuration - UPDATE THESE VALUES
  const ENS_DOMAIN = SEPOLIA_CONFIG.domain; // Your ENS domain

  const Betflix = await ethers.getContractFactory("Betflix");
  const contractInstance = await Betflix.deploy(SEPOLIA_CONFIG.pyth);

  await contractInstance.waitForDeployment();
  console.log("Betflix deployed to:", contractInstance.target);

  await setTimeout(20000);

  // Verify contract
  console.log("Verifying Betflix...");
  await hre.run("verify:verify", {
    address: contractInstance.target,
    constructorArguments: [SEPOLIA_CONFIG.pyth],
  });

  // Calculate domain node
  const domainNode = ethers.namehash(ENS_DOMAIN);
  console.log(`Domain: ${ENS_DOMAIN}`);
  console.log(`Domain Node: ${domainNode}`);

  // Configure ENS
  console.log("\nCalling configureENS...");
  const tx = await contractInstance.configureENS(
    SEPOLIA_CONFIG.nameWrapperAddress,
    domainNode,
    SEPOLIA_CONFIG.resolverAddress,
    ENS_DOMAIN,
  );
  console.log("Transaction hash:", tx.hash);
  await tx.wait();
  console.log("✅ ENS configured successfully!");

  // Get NameWrapper contract
  const nameWrapper = new ethers.Contract(SEPOLIA_CONFIG.nameWrapperAddress, NAME_WRAPPER_ABI, signer);

  // Set approval
  console.log("\nApproving Betflix contract as operator...");
  const setApprovalForAllTx = await nameWrapper.setApprovalForAll(contractInstance.target, true);
  console.log("Transaction hash:", setApprovalForAllTx.hash);
  await setApprovalForAllTx.wait();

  // Verify approval
  const newApprovalStatus = await nameWrapper.isApprovedForAll(signer.address, contractInstance.target);
  if (newApprovalStatus) {
    console.log("✅ Betflix contract approved as operator successfully!");
  } else {
    console.log("❌ Failed to approve Betflix contract as operator");
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
