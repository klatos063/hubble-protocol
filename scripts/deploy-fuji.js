const { expect } = require('chai')
const utils = require('../test/utils')

const {
    constants: { _1e6, _1e8, _1e18 },
    setupContracts,
    setupRestrictedTestToken,
    setupAmm,
    generateConfig,
    sleep,
    txOptions
} = utils
const gasLimit = 6e6

async function main() {
    signers = await ethers.getSigners()
    governance = signers[0].address

    // nonce can't be played around with in automine mode.
    // so if you run this script with --network local, uncomment the following 2 lines
    // await network.provider.send("evm_setAutomine", [false])
    // await network.provider.send("evm_setIntervalMining", [500])
    // await web3.eth.sendTransaction({ from: governance, to: governance, value: _1e18 })

    txOptions.nonce = await signers[0].getTransactionCount()
    txOptions.gasLimit = gasLimit

    // 1. All the main contracts
    await setupContracts({ governance, setupAMM: false, testOracle: false })
    console.log({ vammImpl: vammImpl.address })
    console.log({ curveMath: curveMath.address })
    console.log({ ammImpl: ammImpl.address })

    // 2. Collaterals
    console.log('setting up collateral tokens...')
    avax = await setupRestrictedTestToken('Hubble AVAX', 'hAVAX', 18)
    weth = await setupRestrictedTestToken('Hubble Ether', 'hWETH', 18)
    btc = await setupRestrictedTestToken('Hubble BTC', 'hWBTC', 8)

    console.log('setting aggregators...')
    await oracle.setAggregator(avax.address, '0x5498BB86BC934c8D34FDA08E81D444153d0D06aD', { nonce: txOptions.nonce++, gasLimit }) // AVAX / USD Feed
    await oracle.setAggregator(weth.address, '0x86d67c3D38D2bCeE722E601025C25a575021c6EA', { nonce: txOptions.nonce++, gasLimit }) // ETH / USD Feed
    await oracle.setAggregator(btc.address, '0x31CF013A08c6Ac228C94551d535d5BAfE19c602a', { nonce: txOptions.nonce++, gasLimit }) // BTC / USD Feed

    console.log('whitelistCollateral...')
    await marginAccount.whitelistCollateral(avax.address, 8e5, { nonce: txOptions.nonce++, gasLimit }) // weight = 0.8e6
    await marginAccount.whitelistCollateral(weth.address, 8e5, { nonce: txOptions.nonce++, gasLimit })
    await marginAccount.whitelistCollateral(btc.address, 8e5, { nonce: txOptions.nonce++, gasLimit })

    // 3. Mint and Add Margin
    const margin = _1e6.mul(_1e6).mul(4)
    await vusd.mint(governance, margin, { nonce: txOptions.nonce++, gasLimit })
    await vusd.approve(marginAccount.address, margin, { nonce: txOptions.nonce++, gasLimit })
    await marginAccount.addMargin(0, margin, { nonce: txOptions.nonce++, gasLimit })

    console.log('setup AMMs...')
    // 4. AMMs
    await setupAmm(
        governance,
        [ registry.address, avax.address, 'AVAX-PERP' ],
        {
            index: 0,
            initialRate: 90,
            initialLiquidity: 0,
            fee: 5000000, // .05%
        }
    )
    await clearingHouse.addLiquidity(0, _1e18.mul(5555), 0, { nonce: txOptions.nonce++, gasLimit })

    await setupAmm(
        governance,
        [ registry.address, weth.address, 'ETH-PERP' ],
        {
            index: 1,
            initialRate: 3110,
            initialLiquidity: 0,
            fee: 5000000, // .05%
        }
    )
    await clearingHouse.addLiquidity(1, _1e18.mul(160), 0, { nonce: txOptions.nonce++, gasLimit })

    await setupAmm(
        governance,
        [ registry.address, btc.address, 'BTC-PERP' ],
        {
            index: 2,
            initialRate: 43500,
            initialLiquidity: 0,
            fee: 5000000, // .05%
        }
    )
    await clearingHouse.addLiquidity(2, _1e18.mul(11), 0, { nonce: txOptions.nonce++, gasLimit })

    console.log('sleeping for 10s...')
    await sleep(10)
    console.log(JSON.stringify(await generateConfig(leaderboard.address), null, 2))

    // 4. Setup Faucet
    console.log('setting up faucet...')
    faucet = '0x40ac7FaFeBc2D746E6679b8Da77F1bD9a5F1484f'
    const Executor = await ethers.getContractFactory('Executor')
    executor = await Executor.deploy({ nonce: txOptions.nonce++, gasLimit })
    console.log({ executor: executor.address })

    // mint test tokens to faucet
    airdropAmounts = {
        vusd: _1e6.mul(20000),
        avax: _1e18.mul(100),
        weth: _1e18.mul(3),
        btc: _1e8.mul(3).div(10)
    }
    const users = 50
    const DEFAULT_ADMIN_ROLE = '0x' + '0'.repeat(64)
    const TRANSFER_ROLE = ethers.utils.id('TRANSFER_ROLE')
    await Promise.all([
        executor.grantRole(DEFAULT_ADMIN_ROLE, faucet, { nonce: txOptions.nonce++, gasLimit }),
        vusd.grantRole(TRANSFER_ROLE, executor.address, { nonce: txOptions.nonce++, gasLimit }),
        avax.grantRole(TRANSFER_ROLE, executor.address, { nonce: txOptions.nonce++, gasLimit }),
        weth.grantRole(TRANSFER_ROLE, executor.address, { nonce: txOptions.nonce++, gasLimit }),
        btc.grantRole(TRANSFER_ROLE, executor.address, { nonce: txOptions.nonce++, gasLimit }),
        vusd.mint(executor.address, airdropAmounts.vusd.mul(users), { nonce: txOptions.nonce++, gasLimit }),
        avax.mint(executor.address, airdropAmounts.avax.mul(users), { nonce: txOptions.nonce++, gasLimit }),
        weth.mint(executor.address, airdropAmounts.weth.mul(users), { nonce: txOptions.nonce++, gasLimit }),
        btc.mint(executor.address, airdropAmounts.btc.mul(users), { nonce: txOptions.nonce++, gasLimit }),
    ])

    // await testFaucet(signers[1].address)
}

async function testFaucet(recipient) {
    const tx = [
        [vusd.address, avax.address, weth.address, btc.address],
        [
          vusd.interface.encodeFunctionData("transfer", [recipient,airdropAmounts.vusd]),
          avax.interface.encodeFunctionData("transfer", [recipient,airdropAmounts.avax]),
          weth.interface.encodeFunctionData("transfer", [recipient, airdropAmounts.weth]),
          btc.interface.encodeFunctionData("transfer", [recipient, airdropAmounts.btc]),
        ],
    ];
    await utils.impersonateAcccount(faucet)
    await web3.eth.sendTransaction({ from: signers[0].address, to: faucet, value: _1e18 })
    await executor.connect(ethers.provider.getSigner(faucet)).execute(...tx)

    await sleep(2)
    expect(await vusd.balanceOf(recipient)).to.eq(airdropAmounts.vusd)
    expect(await avax.balanceOf(recipient)).to.eq(airdropAmounts.avax)
    expect(await weth.balanceOf(recipient)).to.eq(airdropAmounts.weth)
    expect(await btc.balanceOf(recipient)).to.eq(airdropAmounts.btc)
}

main()
.then(() => process.exit(0))
.catch(error => {
    console.error(error);
    process.exit(1);
});
