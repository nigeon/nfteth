import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { BigNumber, Contract } from "ethers";

const WETH_ADDRESS = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const RETH_ADDRESS = "0xae78736cd615f374d3085123a210448e74fc6393";
const WSTETH_ADDRESS = "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0";

let erc20Contract: Contract;

describe("Nfteth", () => {
    async function deployFixture() {
        const [owner, alice, bob] = await ethers.getSigners();

        // Deploying dummy ERC20
        const testContractFactory = await ethers.getContractFactory("TestToken");
        erc20Contract = await testContractFactory.deploy("DummyErc20", "DERC20");
        await erc20Contract.deployed();
        expect(erc20Contract.address).to.be.properAddress;
        await erc20Contract.mint(owner.address, ethers.utils.parseEther("10000"));
        await erc20Contract.mint(alice.address, ethers.utils.parseEther("10000"));
        await erc20Contract.mint(bob.address, ethers.utils.parseEther("10000"));

        // Deploying the NFT
        const contractFactory = await ethers.getContractFactory("Nfteth");
        const nftContract: Contract = await contractFactory.deploy("Nfteth", "NFTETH");
        await nftContract.deployed();

        await nftContract.addAcceptedTokens([erc20Contract.address]);

        return { nftContract, owner, alice, bob };
    }

    describe("Deployment & Admin", () => {   
      it("Should set the right owner and id counter", async () => {
          const { nftContract, owner } = await loadFixture(deployFixture);

          expect(await nftContract.owner()).to.equal(owner.address);
          expect(await nftContract.tokenIdsCounter()).to.equal(1);
      });
      
      it("Should revert with the right error if called from another account", async () => {
        const { nftContract, alice } = await loadFixture(deployFixture);
        await expect(nftContract.connect(alice).addAcceptedTokens([])).to.be.revertedWithCustomError(nftContract, 'OnlyOwner');
      });
    
      it("Should setup accepted tokens", async () => {
        const { nftContract, owner } = await loadFixture(deployFixture);
        const tokens = [RETH_ADDRESS, WSTETH_ADDRESS];

        await expect(nftContract.addAcceptedTokens(tokens)).to.emit(nftContract, "AcceptedTokens");
        expect(await nftContract.acceptedTokens(RETH_ADDRESS)).to.be.true;
        expect(await nftContract.acceptedTokens(WSTETH_ADDRESS)).to.be.true;
        expect(await nftContract.acceptedTokens(WETH_ADDRESS)).to.be.false;

        await expect(nftContract.addAcceptedTokens([WETH_ADDRESS])).to.emit(nftContract, "AcceptedTokens");
        expect(await nftContract.acceptedTokens(RETH_ADDRESS)).to.be.true;
        expect(await nftContract.acceptedTokens(WSTETH_ADDRESS)).to.be.true;
        expect(await nftContract.acceptedTokens(WETH_ADDRESS)).to.be.true;
      });
    });

    describe("Minting", () => {
      it("Should revert with the right error", async () => {
          const { nftContract, owner } = await loadFixture(deployFixture);

          await expect(nftContract.mint(WSTETH_ADDRESS, 10)).to.be.revertedWithCustomError(nftContract, 'UnacceptedToken');

          await expect(nftContract.addAcceptedTokens([WSTETH_ADDRESS])).to.emit(nftContract, "AcceptedTokens");
          await expect(nftContract.mint(WSTETH_ADDRESS, 10)).to.be.revertedWithCustomError(nftContract, 'NotEnoughBalance');

          await expect(nftContract.mint(erc20Contract.address, 10)).to.be.revertedWithCustomError(nftContract, 'NotEnoughAllowance');
      });
  
      it("Should emit an event on minting and store the nftData", async () => {
          const { nftContract } = await loadFixture(deployFixture);

          const expectedTokenId = 1;
          const amount = 100;
          await erc20Contract.approve(nftContract.address, amount);
          await expect(nftContract.mint(erc20Contract.address, amount)).to.emit(nftContract, 'Minted').withArgs(expectedTokenId);
          expect(await erc20Contract.balanceOf(nftContract.address)).to.be.equal(amount);

          const data = await nftContract.nftsData(expectedTokenId);
          expect(data.token).to.be.equal(erc20Contract.address);
          expect(data.amount).to.be.equal(amount);
      });
    });

    describe("Burning", () => {
      it("Should revert with the right error", async () => {
        const { nftContract, alice } = await loadFixture(deployFixture);

        const amount = 100;
        const expectedTokenId = 1;
        await erc20Contract.approve(nftContract.address, amount);
        await expect(nftContract.mint(erc20Contract.address, amount)).to.emit(nftContract, 'Minted');

        await expect(nftContract.connect(alice).burn(expectedTokenId)).to.be.revertedWithCustomError(nftContract, 'OnlyNftOwner');

        await nftContract.burn(expectedTokenId);

        // await expect(nftContract.burn(expectedTokenId)).to.be.revertedWithCustomError(nftContract, 'NftAlreadyBurned');
        await expect(nftContract.burn(expectedTokenId)).to.be.revertedWith('ERC721: invalid token ID');
      });

      it("Should emit an event on burning and transfer funds to the owner", async () => {
        const { nftContract, alice } = await loadFixture(deployFixture);

        const amount = 100;
        const expectedTokenId = 1;
        await erc20Contract.connect(alice).approve(nftContract.address, amount);
        await expect(nftContract.connect(alice).mint(erc20Contract.address, amount)).to.emit(nftContract, 'Minted');

        const beforeBurnBalance = await erc20Contract.balanceOf(alice.address);
        await expect(nftContract.connect(alice).burn(expectedTokenId)).to.emit(nftContract, "Withdrawn").withArgs(alice.address, erc20Contract.address, amount);

        expect(await erc20Contract.balanceOf(nftContract.address)).to.be.equal(0);
        expect(await erc20Contract.balanceOf(alice.address)).to.be.equal(beforeBurnBalance.add(amount));
      });
    });
});