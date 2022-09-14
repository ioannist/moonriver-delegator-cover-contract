// Example test script - Uses Mocha and Ganache
const AuthManager = artifacts.require("AuthManager");
const InactivityCover = artifacts.require("InactivityCover_mock");
const Oracle = artifacts.require("Oracle");
const OracleMaster = artifacts.require("OracleMaster");
const DepositStaking = artifacts.require("DepositStaking_mock");

const chai = require("chai");
const BN = require('bn.js');
const chaiBN = require("chai-bn")(BN);
chai.use(chaiBN);

const chaiAsPromised = require("chai-as-promised");
const { assert } = require("chai");
chai.use(chaiAsPromised);

const chaiAlmost = require('chai-almost');
chai.use(chaiAlmost(0.1));

const expect = chai.expect;

contract('InactivityCover', accounts => {

    // test ging under MIN_DEPOSIT and going inactive
    // check getErasCovered returns the right number

    let am;
    let ic;
    let or;
    let om;
    let ds;

    const superior = accounts[0];
    const dev = accounts[1];
    const manager = accounts[2];
    const member1 = accounts[3]
    const member2 = accounts[4]
    const delegator1 = accounts[5]
    const delegator2 = accounts[6]
    const oracleManager = accounts[7]

    require('dotenv').config()
    const _min_deposit = web3.utils.toWei(process.env.MIN_DEPOSIT, "ether");
    const _max_deposit_total = web3.utils.toWei(process.env.MAX_DEPOSIT_TOTAL, "ether");
    const _stake_unit_cover = web3.utils.toWei(process.env.STAKE_UNIT_COVER, "wei");
    const _min_payout = web3.utils.toWei(process.env.MIN_PAYOUT, "wei"); // practically no min payment
    const _eras_between_forced_undelegation = process.env.ERAS_BETWEEN_FORCED_UNDELEGATION;
    const _quorum = process.env.QUORUM;
    const ZERO_ADDR = "0x0000000000000000000000000000000000000000";
    const zero = new BN("0")
    const payoutReversed = false;

    beforeEach(async () => {

        // replenish balancesif low
        await web3.eth.sendTransaction({ to: superior, from: dev, value: web3.utils.toWei("1000", "ether") });
        await web3.eth.sendTransaction({ to: manager, from: dev, value: web3.utils.toWei("1000", "ether") });
        await web3.eth.sendTransaction({ to: member1, from: dev, value: web3.utils.toWei("1000", "ether") });
        await web3.eth.sendTransaction({ to: member2, from: dev, value: web3.utils.toWei("1000", "ether") });
        await web3.eth.sendTransaction({ to: oracleManager, from: dev, value: web3.utils.toWei("1000", "ether") });


        am = await AuthManager.new();
        assert.ok(am);
        await am.initialize(superior);
        await am.addByString('ROLE_MANAGER', manager);
        await am.addByString('ROLE_ORACLE_MEMBERS_MANAGER', oracleManager);

        ic = await InactivityCover.new();
        assert.ok(ic);
        or = await Oracle.new();
        assert.ok(or);
        om = await OracleMaster.new();
        assert.ok(om);
        ds = await DepositStaking.new();
        assert.ok(ds);

        console.log(`Initializing OracleMaster`);
        await om.initialize(
            am.address,
            or.address,
            ic.address,
            _quorum,
        );

        console.log(`Initializing Oracle`);
        await or.initialize(om.address, ic.address);

        console.log(`Initializing DepositStaking`);
        await ds.initialize(am.address, ic.address);

        console.log(`Initializing InactivityCover`);
        await ic.initialize(
            am.address,
            om.address,
            ds.address,
            _min_deposit,
            _max_deposit_total,
            _stake_unit_cover,
            _min_payout,
            _eras_between_forced_undelegation
        );

    });

    it("manager cannot delegate if a delegator was not paid", async () => {
        const candidate = member1;
        const amount = web3.utils.toWei("2", "ether");
        const candidateDelegationCount = "150";
        const delegatorDelegationCount = "1";
        await ic.setDelegatorNotPaid_mock(delegator1);
        await expect(ds.delegate(candidate, amount, candidateDelegationCount, delegatorDelegationCount, { from: manager }))
            .to.be.rejectedWith('DELEG_N_PAID');
        await expect(ds.delegatorBondMore(candidate, amount, { from: manager }))
            .to.be.rejectedWith('DELEG_N_PAID');

    });


    it("manager cannot delegate if a member was not paid", async () => {
        const candidate = member1;
        const amount = web3.utils.toWei("2", "ether");
        const candidateDelegationCount = "150";
        const delegatorDelegationCount = "1";
        await ic.setMemberNotPaid_mock(delegator1)
        await expect(ds.delegate(candidate, amount, candidateDelegationCount, delegatorDelegationCount, { from: manager }))
            .to.be.rejectedWith('MEMBER_N_PAID');
        await expect(ds.delegatorBondMore(candidate, amount, { from: manager }))
            .to.be.rejectedWith('MEMBER_N_PAID');
    });

    it("manager can delegate and delegation is recorded", async () => {
        const deposit = web3.utils.toWei("200", "ether");
        const candidate = member2;
        const amount = web3.utils.toWei("2", "ether");
        const candidateDelegationCount = "150";
        const delegatorDelegationCount = "1";
        await ic.whitelist(member1, true, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit }); // ic gets 200 ether
        const icBalanceStart = new BN(await web3.eth.getBalance(ic.address));
        await ds.delegate(candidate, amount, candidateDelegationCount, delegatorDelegationCount, { from: manager });
        const icBalanceExpected = icBalanceStart.sub(new BN(amount));
        await expect(ds.getIsDelegated(candidate, { from: manager })).to.eventually.be.true;
        await expect(ds.getDelegation(candidate, { from: manager })).to.eventually.be.bignumber.equal(new BN(amount));
        await expect(ds.getCollatorsDelegated(0, { from: manager })).to.eventually.be.equal(candidate);
        await expect(web3.eth.getBalance(ic.address)).to.eventually.be.bignumber.equal(icBalanceExpected);
    })

    it("manager can bond more and delegation is recorded", async () => {
        const deposit = web3.utils.toWei("200", "ether");
        const candidate = member2;
        const amount = web3.utils.toWei("2", "ether");
        const more = web3.utils.toWei("1", "ether");
        const delegationExpected = new BN(amount).add(new BN(more));
        const candidateDelegationCount = "150";
        const delegatorDelegationCount = "1";
        await ic.whitelist(member1, true, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit }); // ic gets 200 ether
        const icBalanceStart = new BN(await web3.eth.getBalance(ic.address));
        const icBalanceExpected = icBalanceStart.sub(new BN(amount)).sub(new BN(more));
        await ds.delegate(candidate, amount, candidateDelegationCount, delegatorDelegationCount, { from: manager });
        await ds.delegatorBondMore(candidate, more, { from: manager });
        await expect(ds.getIsDelegated(candidate, { from: manager })).to.eventually.be.true;
        await expect(ds.getDelegation(candidate, { from: manager })).to.eventually.be.bignumber.equal(delegationExpected);
        await expect(ds.getCollatorsDelegated(0, { from: manager })).to.eventually.be.equal(candidate);
        await expect(web3.eth.getBalance(ic.address)).to.eventually.be.bignumber.equal(icBalanceExpected);
    })

    it("manager can schedule a delegation decrease and delegation is recorded", async () => {
        const deposit = web3.utils.toWei("200", "ether");
        const candidate = member2;
        const amount = web3.utils.toWei("2", "ether");
        const less = web3.utils.toWei("1", "ether");
        const delegationExpected = new BN(amount).sub(new BN(less));
        const candidateDelegationCount = "150";
        const delegatorDelegationCount = "1";
        await ic.whitelist(member1, true, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit }); // ic gets 200 ether
        await ds.delegate(candidate, amount, candidateDelegationCount, delegatorDelegationCount, { from: manager });
        await ds.scheduleDelegatorBondLess(candidate, less, { from: manager });
        await expect(ds.getIsDelegated(candidate, { from: manager })).to.eventually.be.true;
        await expect(ds.getDelegation(candidate, { from: manager })).to.eventually.be.bignumber.equal(delegationExpected);
        await expect(ds.getCollatorsDelegated(0, { from: manager })).to.eventually.be.equal(candidate);
    })

    it("delegated collator is removed from delegations when decreased to 0", async () => {
        const deposit = web3.utils.toWei("200", "ether");
        const candidate = member2;
        const amount = web3.utils.toWei("2", "ether");
        const less = web3.utils.toWei("2", "ether");
        const delegationExpected = new BN(amount).sub(new BN(less));
        const candidateDelegationCount = "150";
        const delegatorDelegationCount = "1";
        await ic.whitelist(member1, true, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit }); // ic gets 200 ether
        const icBalanceStart = new BN(await web3.eth.getBalance(ic.address));
        const icBalanceExpected = icBalanceStart.sub(new BN(amount)); // less is not executed until later, so it does not affect balance
        await ds.delegate(candidate, amount, candidateDelegationCount, delegatorDelegationCount, { from: manager });
        await ds.scheduleDelegatorBondLess(candidate, less, { from: manager });
        await expect(ds.getIsDelegated(candidate, { from: manager })).to.eventually.be.false;
        await expect(ds.getDelegation(candidate, { from: manager })).to.eventually.be.bignumber.equal(delegationExpected);
        await expect(ds.getCollatorsDelegated(0, { from: manager })).to.eventually.be.equal(ZERO_ADDR);
        await expect(web3.eth.getBalance(ic.address)).to.eventually.be.bignumber.equal(icBalanceExpected);
    })

    it("manager delegates to 2 collators, staked total is updated", async () => {
        const deposit = web3.utils.toWei("200", "ether");
        const candidate = member1;
        const candidate2 = member2;
        const amount = web3.utils.toWei("2", "ether");
        const stakedTotalExpected = new BN(amount).add(new BN(amount));
        const candidateDelegationCount = "150";
        const delegatorDelegationCount = "1";
        await ic.whitelist(member1, true, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit }); // ic gets 200 ether
        await ds.delegate(candidate, amount, candidateDelegationCount, delegatorDelegationCount, { from: manager });
        await ds.delegate(candidate2, amount, candidateDelegationCount, delegatorDelegationCount, { from: manager });
        await expect(ds.stakedTotal({ from: dev })).to.eventually.be.bignumber.equal(stakedTotalExpected);
    })

    it("one collator is removed from delegations, but the second one remains", async () => {
        const deposit = web3.utils.toWei("200", "ether");
        const candidate = member1;
        const candidate2 = member2;
        const amount = web3.utils.toWei("2", "ether");
        const amount2 = web3.utils.toWei("5", "ether");
        const less = web3.utils.toWei("2", "ether");
        const delegationExpected = new BN(amount).sub(new BN(less));
        const candidateDelegationCount = "150";
        const delegatorDelegationCount = "1";
        await ic.whitelist(member1, true, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit }); // ic gets 200 ether
        const icBalanceStart = new BN(await web3.eth.getBalance(ic.address));
        const icBalanceExpected = icBalanceStart.sub(new BN(amount)).sub(new BN(amount2));
        await ds.delegate(candidate, amount, candidateDelegationCount, delegatorDelegationCount, { from: manager });
        await ds.delegate(candidate2, amount2, candidateDelegationCount, delegatorDelegationCount, { from: manager });
        await ds.scheduleDelegatorBondLess(candidate, less, { from: manager });
        await expect(ds.getIsDelegated(candidate, { from: manager })).to.eventually.be.false;
        await expect(ds.getDelegation(candidate, { from: manager })).to.eventually.be.bignumber.equal(delegationExpected);
        await expect(ds.getCollatorsDelegated(0, { from: manager })).to.eventually.be.equal(ZERO_ADDR);
        await expect(ds.getIsDelegated(candidate2, { from: manager })).to.eventually.be.true;
        await expect(ds.getDelegation(candidate2, { from: manager })).to.eventually.be.bignumber.equal(amount2);
        await expect(ds.getCollatorsDelegated(1, { from: manager })).to.eventually.be.equal(candidate2);
        await expect(web3.eth.getBalance(ic.address)).to.eventually.be.bignumber.equal(icBalanceExpected);
    })

    it("force bond less fails if there is no non-paid delegator or member", async () => {
        const less = web3.utils.toWei("2", "ether");
        await expect(ds.forceScheduleDelegatorBondLess(less)).to.be.rejectedWith('FORBIDDEN');
    })

    it("force bond less fails if nothing is staked (1)", async () => {
        const less = web3.utils.toWei("2", "ether");
        const coverOwedtotal = web3.utils.toWei("3", "ether");
        await ic.setDelegatorNotPaid_mock(delegator1);
        await ic.setCoverOwedTotal_mock(coverOwedtotal);
        await expect(ds.forceScheduleDelegatorBondLess(less)).to.be.rejectedWith('ZERO_STAKED');
    })

    it("force bond less fails if nothing is staked (2)", async () => {
        const less = web3.utils.toWei("2", "ether");
        await ic.setMemberNotPaid_mock(member1);
        await expect(ds.forceScheduleDelegatorBondLess(less)).to.be.rejectedWith('ZERO_STAKED');
    })

    it("trying to force an undelegation larger than the total cover owed, should fail", async () => {
        const less = web3.utils.toWei("2", "ether");
        const coverOwedtotal = web3.utils.toWei("1", "ether");
        const deposit = web3.utils.toWei("200", "ether");
        const candidate = member2;
        const amount = web3.utils.toWei("2", "ether");
        const candidateDelegationCount = "150";
        const delegatorDelegationCount = "1";

        await ic.whitelist(member1, true, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit }); // ic gets 200 ether
        await ds.delegate(candidate, amount, candidateDelegationCount, delegatorDelegationCount, { from: manager });

        await ic.setDelegatorNotPaid_mock(delegator1);
        await ic.setCoverOwedTotal_mock(coverOwedtotal);
        await expect(ds.forceScheduleDelegatorBondLess(less)).to.be.rejectedWith('FORBIDDEN');
    })

    it("force undelegate succesfully undelegates from the one and only delegated collator", async () => {
        const delegation = web3.utils.toWei("3", "ether");
        const less = web3.utils.toWei("1", "ether");
        const deposit = web3.utils.toWei("200", "ether");
        const candidateDelegationCount = "150";
        const delegatorDelegationCount = "1";
        const delegationExpected = new BN(delegation).sub(new BN(less));

        await ic.timetravel(100 + _eras_between_forced_undelegation);
        await ic.whitelist(member2, true, { from: manager });
        await ic.depositCover(member2, { from: member2, value: deposit }); // ic gets 200 ether
        const icBalanceStart = new BN(await web3.eth.getBalance(ic.address));
        const icBalanceExpected = icBalanceStart.sub(new BN(delegation));

        await ds.delegate(member1, delegation, candidateDelegationCount, delegatorDelegationCount, { from: manager });
        await ic.setMemberNotPaid_mock(member1);
        const stakedTotalExpected = new BN(delegation).sub(new BN(less));

        await ds.forceScheduleDelegatorBondLess(less, { from: dev }); // should not throw
        await expect(ds.getIsDelegated(member1, { from: manager })).to.eventually.be.true;
        await expect(ds.getDelegation(member1, { from: manager })).to.eventually.be.bignumber.equal(delegationExpected);
        await expect(ds.getCollatorsDelegated(0, { from: manager })).to.eventually.be.equal(member1);
        await expect(ds.stakedTotal({ from: dev })).to.eventually.be.bignumber.equal(stakedTotalExpected);
        await expect(web3.eth.getBalance(ic.address)).to.eventually.be.bignumber.equal(icBalanceExpected);
    })

    it("force undelegate for a second time throws a too frequent error", async () => {
        const delegation = web3.utils.toWei("3", "ether");
        const less = web3.utils.toWei("1", "ether");
        const deposit = web3.utils.toWei("200", "ether");
        const candidateDelegationCount = "150";
        const delegatorDelegationCount = "1";

        await ic.timetravel(100 + _eras_between_forced_undelegation);
        await ic.whitelist(member2, true, { from: manager });
        await ic.depositCover(member2, { from: member2, value: deposit }); // ic gets 200 ether

        await ds.delegate(member1, delegation, candidateDelegationCount, delegatorDelegationCount, { from: manager });
        await ic.setMemberNotPaid_mock(dev);

        await ds.forceScheduleDelegatorBondLess(less, { from: dev }); // should not throw
        await ic.timetravel(+_eras_between_forced_undelegation - 20);
        await expect(ds.forceScheduleDelegatorBondLess(less, { from: dev })).to.be.rejectedWith('TOO_FREQUENT');
    })

    it("force undelegate succesfully undelegates one of two collators", async () => {
        const delegation = web3.utils.toWei("3", "ether");
        const less = web3.utils.toWei("1", "ether");
        const deposit = web3.utils.toWei("200", "ether");
        const candidateDelegationCount = "150";
        const delegatorDelegationCount = "1";
        const delegationExpected = new BN(delegation).sub(new BN(less));

        await ic.timetravel(100 + _eras_between_forced_undelegation);
        await ic.whitelist(member2, true, { from: manager });
        await ic.depositCover(member2, { from: member2, value: deposit }); // ic gets 200 ether
        const icBalanceStart = new BN(await web3.eth.getBalance(ic.address));
        const icBalanceExpected = icBalanceStart.sub(new BN(delegation)).sub(new BN(delegation));

        await ds.delegate(member1, delegation, candidateDelegationCount, delegatorDelegationCount, { from: manager });
        await ds.delegate(member2, delegation, candidateDelegationCount, delegatorDelegationCount, { from: manager });
        await ic.setMemberNotPaid_mock(dev);
        const stakedTotalExpected = new BN(delegation).add(new BN(delegation)).sub(new BN(less));

        await ds.forceScheduleDelegatorBondLess(less, { from: dev }); // should not throw
        try {
            await expect(ds.getIsDelegated(member1, { from: manager })).to.eventually.be.true;
            await expect(ds.getDelegation(member1, { from: manager })).to.eventually.be.bignumber.equal(delegationExpected);
        } catch {
            // if the above fails, this must succeed (choice of collator to undelegate from is random)
            await expect(ds.getIsDelegated(member2, { from: manager })).to.eventually.be.true;
            await expect(ds.getDelegation(member2, { from: manager })).to.eventually.be.bignumber.equal(delegationExpected);
        }
        await expect(ds.getCollatorsDelegated(0, { from: manager })).to.eventually.be.equal(member1);
        await expect(ds.getCollatorsDelegated(1, { from: manager })).to.eventually.be.equal(member2);
        await expect(ds.stakedTotal({ from: dev })).to.eventually.be.bignumber.equal(stakedTotalExpected);
        await expect(web3.eth.getBalance(ic.address)).to.eventually.be.bignumber.equal(icBalanceExpected);
    })

    it("force undelegate succesfully undelegates fully one of two collators", async () => {
        const delegation = web3.utils.toWei("3", "ether");
        const less = web3.utils.toWei("3", "ether");
        const deposit = web3.utils.toWei("200", "ether");
        const candidateDelegationCount = "150";
        const delegatorDelegationCount = "1";
        const delegationExpected = BN.max(new BN("0"), new BN(delegation).sub(new BN(less)));

        await ic.timetravel(100 + _eras_between_forced_undelegation);
        await ic.whitelist(member2, true, { from: manager });
        await ic.depositCover(member2, { from: member2, value: deposit }); // ic gets 200 ether
        const icBalanceStart = new BN(await web3.eth.getBalance(ic.address));
        const icBalanceExpected = icBalanceStart.sub(new BN(delegation)).sub(new BN(delegation));

        await ds.delegate(member1, delegation, candidateDelegationCount, delegatorDelegationCount, { from: manager });
        await ds.delegate(member2, delegation, candidateDelegationCount, delegatorDelegationCount, { from: manager });
        await ic.setMemberNotPaid_mock(dev);
        const stakedTotalExpected = BN.max(new BN("0"), new BN(delegation).add(new BN(delegation)).sub(new BN(less)));

        await ds.forceScheduleDelegatorBondLess(less, { from: dev }); // should not throw
        try {
            await expect(ds.getIsDelegated(member1, { from: manager })).to.eventually.be.false;
            await expect(ds.getDelegation(member1, { from: manager })).to.eventually.be.bignumber.equal(delegationExpected);
            await expect(ds.getCollatorsDelegated(0, { from: manager })).to.eventually.be.equal(ZERO_ADDR);
        } catch {
            // if the above fails, this must succeed (choice of collator to undelegate from is random)
            await expect(ds.getIsDelegated(member2, { from: manager })).to.eventually.be.false;
            await expect(ds.getDelegation(member2, { from: manager })).to.eventually.be.bignumber.equal(delegationExpected);
            await expect(ds.getCollatorsDelegated(1, { from: manager })).to.eventually.be.equal(ZERO_ADDR);
        }
        await expect(ds.stakedTotal({ from: dev })).to.eventually.be.bignumber.equal(stakedTotalExpected);
        await expect(web3.eth.getBalance(ic.address)).to.eventually.be.bignumber.equal(icBalanceExpected);
    })

    it("force undelegate succesfully undelegates fully one of two collators, but not entire requested undelegation amount is met", async () => {
        const delegation = web3.utils.toWei("3", "ether");
        const less = web3.utils.toWei("4", "ether");
        const deposit = web3.utils.toWei("200", "ether");
        const candidateDelegationCount = "150";
        const delegatorDelegationCount = "1";
        const delegationExpected = BN.max(new BN("0"), new BN(delegation).sub(new BN(less)));

        await ic.timetravel(100 + _eras_between_forced_undelegation);
        await ic.whitelist(member2, true, { from: manager });
        await ic.depositCover(member2, { from: member2, value: deposit }); // ic gets 200 ether
        const icBalanceStart = new BN(await web3.eth.getBalance(ic.address));
        const icBalanceExpected = icBalanceStart.sub(new BN(delegation)).sub(new BN(delegation));

        await ds.delegate(member1, delegation, candidateDelegationCount, delegatorDelegationCount, { from: manager });
        await ds.delegate(member2, delegation, candidateDelegationCount, delegatorDelegationCount, { from: manager });
        await ic.setMemberNotPaid_mock(dev);
        const stakedTotalExpected = BN.max(new BN("0"), new BN(delegation).add(new BN(delegation)).sub(BN.min(new BN(less), new BN(delegation))));

        await ds.forceScheduleDelegatorBondLess(less, { from: dev }); // should not throw
        try {
            await expect(ds.getIsDelegated(member1, { from: manager })).to.eventually.be.false;
            await expect(ds.getDelegation(member1, { from: manager })).to.eventually.be.bignumber.equal(delegationExpected);
            await expect(ds.getCollatorsDelegated(0, { from: manager })).to.eventually.be.equal(ZERO_ADDR);
        } catch {
            // if the above fails, this must succeed (choice of collator to undelegate from is random)
            await expect(ds.getIsDelegated(member2, { from: manager })).to.eventually.be.false;
            await expect(ds.getDelegation(member2, { from: manager })).to.eventually.be.bignumber.equal(delegationExpected);
            await expect(ds.getCollatorsDelegated(1, { from: manager })).to.eventually.be.equal(ZERO_ADDR);
        }
        await expect(ds.stakedTotal({ from: dev })).to.eventually.be.bignumber.equal(stakedTotalExpected);
        await expect(web3.eth.getBalance(ic.address)).to.eventually.be.bignumber.equal(icBalanceExpected);
    })

    it("force undelegate (x2) succesfully undelegates both collators", async () => {
        const delegation = web3.utils.toWei("3", "ether");
        const less = web3.utils.toWei("4", "ether");
        const deposit = web3.utils.toWei("200", "ether");
        const candidateDelegationCount = "150";
        const delegatorDelegationCount = "1";
        const delegationExpected = BN.max(new BN("0"), new BN(delegation).sub(new BN(less)));

        await ic.timetravel(100 + _eras_between_forced_undelegation);
        await ic.whitelist(member2, true, { from: manager });
        await ic.depositCover(member2, { from: member2, value: deposit }); // ic gets 200 ether
        const icBalanceStart = new BN(await web3.eth.getBalance(ic.address));
        const icBalanceExpected = icBalanceStart.sub(new BN(delegation)).sub(new BN(delegation));

        await ds.delegate(member1, delegation, candidateDelegationCount, delegatorDelegationCount, { from: manager });
        await ds.delegate(member2, delegation, candidateDelegationCount, delegatorDelegationCount, { from: manager });
        await ic.setMemberNotPaid_mock(dev);
        const stakedTotalExpected = BN.max(new BN("0"), new BN(delegation).add(new BN(delegation)).sub(BN.min(new BN(less), new BN(delegation))));
        const stakedTotalExpected2 = BN.max(new BN("0"), stakedTotalExpected.sub(BN.min(new BN(less), new BN(delegation))));

        await ds.forceScheduleDelegatorBondLess(less, { from: dev }); // should not throw
        let member1GoesFirst = false;
        try {
            await expect(ds.getIsDelegated(member1, { from: manager })).to.eventually.be.false;
            await expect(ds.getDelegation(member1, { from: manager })).to.eventually.be.bignumber.equal(delegationExpected);
            await expect(ds.getCollatorsDelegated(0, { from: manager })).to.eventually.be.equal(ZERO_ADDR);
            member1GoesFirst = true;
        } catch {
            // if the above fails, this must succeed (choice of collator to undelegate from is random)
            await expect(ds.getIsDelegated(member2, { from: manager })).to.eventually.be.false;
            await expect(ds.getDelegation(member2, { from: manager })).to.eventually.be.bignumber.equal(delegationExpected);
            await expect(ds.getCollatorsDelegated(1, { from: manager })).to.eventually.be.equal(ZERO_ADDR);
        }
        await expect(ds.stakedTotal({ from: dev })).to.eventually.be.bignumber.equal(stakedTotalExpected);
        await expect(web3.eth.getBalance(ic.address)).to.eventually.be.bignumber.equal(icBalanceExpected);

        await ic.timetravel(1 + _eras_between_forced_undelegation);
        await ds.forceScheduleDelegatorBondLess(less, { from: dev }); // should not throw
        if (!member1GoesFirst) {
            await expect(ds.getIsDelegated(member1, { from: manager })).to.eventually.be.false;
            await expect(ds.getDelegation(member1, { from: manager })).to.eventually.be.bignumber.equal(delegationExpected);
            await expect(ds.getCollatorsDelegated(0, { from: manager })).to.eventually.be.equal(ZERO_ADDR);
        } else {
            // if the above fails, this must succeed (choice of collator to undelegate from is random)
            await expect(ds.getIsDelegated(member2, { from: manager })).to.eventually.be.false;
            await expect(ds.getDelegation(member2, { from: manager })).to.eventually.be.bignumber.equal(delegationExpected);
            await expect(ds.getCollatorsDelegated(1, { from: manager })).to.eventually.be.equal(ZERO_ADDR);
        }
        await expect(ds.stakedTotal({ from: dev })).to.eventually.be.bignumber.equal(stakedTotalExpected2);
        await expect(web3.eth.getBalance(ic.address)).to.eventually.be.bignumber.equal(icBalanceExpected);
    })
})
