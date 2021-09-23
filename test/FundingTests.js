const { expect } = require('chai');

const { getTradeDetails, assertions, setupContracts, constants: { _1e6, _1e18, ZERO }, getTwapPrice } = require('./utils')

describe('Funding Tests', function() {
    beforeEach('contract factories', async function() {
        signers = await ethers.getSigners()
        ;([ _, bob, liquidator1, liquidator2 ] = signers)
        alice = signers[0].address

        contracts = await setupContracts()
        ;({ swap, marginAccount, marginAccountHelper, clearingHouse, amm, vusd, usdc, oracle, weth } = contracts)

        // add margin
        margin = _1e6.mul(1000)
        await addMargin(signers[0], margin)
    })

    it('alice shorts and receives +ve funding', async () => {
        const baseAssetQuantity = _1e18.mul(-5)
        let tx = await clearingHouse.openPosition(0 /* amm index */, baseAssetQuantity, _1e6.mul(4975))
        ;({ quoteAsset, fee } = await getTradeDetails(tx))

        // underlying
        const oracleTwap = _1e6.mul(900)
        await oracle.setTwapPrice(weth.address, oracleTwap)

        tx = await amm.settleFunding()
        const fundingTimestamp = (await ethers.provider.getBlock(tx.blockNumber)).timestamp;

        // mark price
        const twap = await getTwapPrice(amm, 3600, fundingTimestamp)
        const premiumFraction = await amm.getLatestCumulativePremiumFraction()
        expect(premiumFraction).to.eq(twap.sub(oracleTwap).div(24))

        await clearingHouse.updatePositions(alice)

        const fundingReceived = premiumFraction.mul(baseAssetQuantity.mul(-1)).div(_1e18)
        const remainingMargin = margin.add(fundingReceived).sub(fee)
        expect(await marginAccount.margin(0, alice)).to.eq(remainingMargin)
        expect(await marginAccount.getNormalizedMargin(alice)).to.eq(remainingMargin)
        expect(await clearingHouse.isAboveMaintenanceMargin(alice)).to.be.true
        await assertions(contracts, alice, {
            size: baseAssetQuantity,
            openNotional: quoteAsset,
            notionalPosition: quoteAsset,
            unrealizedPnl: 0,
            margin: remainingMargin
        })
    })

    it('alice shorts and pays -ve funding', async () => {
        const baseAssetQuantity = _1e18.mul(-5)
        let tx = await clearingHouse.openPosition(0 /* amm index */, baseAssetQuantity, _1e6.mul(4975))
        ;({ quoteAsset, fee } = await getTradeDetails(tx))

        const oracleTwap = _1e6.mul(1100)
        await oracle.setTwapPrice(weth.address, oracleTwap)

        tx = await amm.settleFunding()
        const fundingTimestamp = (await ethers.provider.getBlock(tx.blockNumber)).timestamp;

        const twap = await getTwapPrice(amm, 3600, fundingTimestamp)
        const premiumFraction = await amm.getLatestCumulativePremiumFraction()
        expect(premiumFraction).to.eq(twap.sub(oracleTwap).div(24))

        await clearingHouse.updatePositions(alice)

        const fundingPaid = premiumFraction.mul(baseAssetQuantity).div(_1e18)
        const remainingMargin = margin.sub(fundingPaid).sub(fee)
        expect(await marginAccount.margin(0, alice)).to.eq(remainingMargin)
        expect(await marginAccount.getNormalizedMargin(alice)).to.eq(remainingMargin)
        expect(await clearingHouse.isAboveMaintenanceMargin(alice)).to.be.true
        await assertions(contracts, alice, {
            size: baseAssetQuantity,
            openNotional: quoteAsset,
            notionalPosition: quoteAsset,
            unrealizedPnl: 0,
            margin: remainingMargin
        })
    })

    it('alice longs and pays +ve funding', async () => {
        const baseAssetQuantity = _1e18.mul(5)
        let tx = await clearingHouse.openPosition(0 /* amm index */, baseAssetQuantity, _1e6.mul(5100))
        ;({ quoteAsset, fee } = await getTradeDetails(tx))

        const oracleTwap = _1e6.mul(900)
        await oracle.setTwapPrice(weth.address, oracleTwap)
        tx = await amm.settleFunding()
        const fundingTimestamp = (await ethers.provider.getBlock(tx.blockNumber)).timestamp;

        const twap = await getTwapPrice(amm, 3600, fundingTimestamp)
        const premiumFraction = await amm.getLatestCumulativePremiumFraction()
        expect(premiumFraction).to.eq(twap.sub(oracleTwap).div(24))

        await clearingHouse.updatePositions(alice)

        const fundingPaid = premiumFraction.mul(baseAssetQuantity).div(_1e18)
        const remainingMargin = margin.sub(fundingPaid).sub(fee)
        expect(await marginAccount.margin(0, alice)).to.eq(remainingMargin)
        expect(await marginAccount.getNormalizedMargin(alice)).to.eq(remainingMargin)
        expect(await clearingHouse.isAboveMaintenanceMargin(alice)).to.be.true
        await assertions(contracts, alice, {
            size: baseAssetQuantity,
            openNotional: quoteAsset,
            notionalPosition: quoteAsset,
            unrealizedPnl: 0,
            margin: remainingMargin
        })
    })

    it('alice longs and receives -ve funding', async () => {
        const baseAssetQuantity = _1e18.mul(5)
        let tx = await clearingHouse.openPosition(0 /* amm index */, baseAssetQuantity, _1e6.mul(5100))
        ;({ quoteAsset, fee } = await getTradeDetails(tx))

        const oracleTwap = _1e6.mul(1100)
        await oracle.setTwapPrice(weth.address, oracleTwap)
        tx = await amm.settleFunding()
        const fundingTimestamp = (await ethers.provider.getBlock(tx.blockNumber)).timestamp;

        const twap = await getTwapPrice(amm, 3600, fundingTimestamp)
        const premiumFraction = await amm.getLatestCumulativePremiumFraction()
        expect(premiumFraction).to.eq(twap.sub(oracleTwap).div(24))

        await clearingHouse.updatePositions(alice)

        const fundingReceived = premiumFraction.mul(baseAssetQuantity).div(_1e18).mul(-1) // premiumFraction is -ve
        const remainingMargin = margin.add(fundingReceived).sub(fee)
        expect(await marginAccount.margin(0, alice)).to.eq(remainingMargin)
        expect(await marginAccount.getNormalizedMargin(alice)).to.eq(remainingMargin)
        expect(await clearingHouse.isAboveMaintenanceMargin(alice)).to.be.true
        await assertions(contracts, alice, {
            size: baseAssetQuantity,
            openNotional: quoteAsset,
            notionalPosition: quoteAsset,
            unrealizedPnl: 0,
            margin: remainingMargin
        })
    })

    it('alice shorts and paying -ve funding causes them to drop below maintenance margin and liquidated', async function() {
        const baseAssetQuantity = _1e18.mul(-5)
        let tx = await clearingHouse.openPosition(0 /* amm index */, baseAssetQuantity, _1e6.mul(4900))
        ;({ quoteAsset, fee } = await getTradeDetails(tx))

        // $1k margin, ~$5k in notional position, < $500 margin will put them underwater => $100 funding/unit
        const oracleTwap = _1e6.mul(3400)
        await oracle.setTwapPrice(weth.address, oracleTwap)
        tx = await amm.settleFunding()
        const fundingTimestamp = (await ethers.provider.getBlock(tx.blockNumber)).timestamp;

        const twap = await getTwapPrice(amm, 3600, fundingTimestamp)
        const premiumFraction = await amm.getLatestCumulativePremiumFraction()
        expect(premiumFraction).to.eq(twap.sub(oracleTwap).div(24))

        await clearingHouse.updatePositions(alice)

        const fundingPaid = premiumFraction.mul(baseAssetQuantity).div(_1e18)
        let remainingMargin = margin.sub(fundingPaid).sub(fee)
        expect(await marginAccount.margin(0, alice)).to.eq(remainingMargin)
        expect(await marginAccount.getNormalizedMargin(alice)).to.eq(remainingMargin)
        await assertions(contracts, alice, {
            size: baseAssetQuantity,
            openNotional: quoteAsset,
            notionalPosition: quoteAsset,
            unrealizedPnl: 0,
            margin: remainingMargin
        })

        // can\'t open new positions below maintenance margin
        expect(await clearingHouse.isAboveMaintenanceMargin(alice)).to.be.false
        await expect(
            clearingHouse.openPosition(0, _1e18.mul(-1), 0)
        ).to.be.revertedWith('CH: Below Maintenance Margin')

        // Liquidate
        ;({ unrealizedPnl, notionalPosition } = await amm.getNotionalPositionAndUnrealizedPnl(alice))
        await clearingHouse.connect(liquidator1).liquidate(alice)

        const liquidationPenalty = notionalPosition.mul(5e4).div(_1e6)
        remainingMargin = remainingMargin.sub(liquidationPenalty)

        expect(await marginAccount.margin(0, alice)).to.eq(remainingMargin) // entire margin is in vusd
        expect(await vusd.balanceOf(liquidator1.address)).to.eq(liquidationPenalty.div(2))
        await assertions(contracts, alice, {
            size: 0,
            openNotional: 0,
            notionalPosition: 0,
            unrealizedPnl: 0,
            margin: remainingMargin
        })
        expect(await clearingHouse.isAboveMaintenanceMargin(alice)).to.be.true
    })

    async function addMargin(trader, margin) {
        await usdc.mint(trader.address, margin)
        await usdc.connect(trader).approve(marginAccountHelper.address, margin)
        await marginAccountHelper.connect(trader).addVUSDMarginWithReserve(margin)
    }
})
