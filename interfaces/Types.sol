// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface Types {

    struct Fee{
        uint16 total;
        uint16 operators;
        uint16 developers;
        uint16 treasury;
    }

    struct Stash {
        bytes32 stashAccount;
        uint64  eraId;
    }

    enum LedgerStatus {
        // bonded but not participate in staking
        Idle,
        // participate as nominator
        Nominator,
        // participate as validator
        Validator,
        // not bonded not participate in staking
        None
    }

    struct UnlockingChunk {
        uint256 balance;
        uint64 era;
    }

    /*struct ScheduledRequestsData {
        // account of delegator who made this request
        address delegator;
        // round when the request is executable
        uint128 whenExecutable;
        // 0 for revoke, 1 for decrease, 2 for leave
        uint128 actionType;
        // associated MOVR amount for that action
        uint128 actionAmount;
    }*/
    struct DelegationsData {
        // delegator address
        address ownerAccount;
        // delegation amount
        // for topActiveDelegations, amount excludes decreases
        uint256 amount;
    }

    struct CollatorData {
        // address of this collator
        address collatorAccount;
        // total points awarded to this collator for this round
        uint128 points;
        // true if this is an active collator, false if it is waiting
        bool active;
        // self-bond amount
        uint256 bond;
        // total of counted delegations
        uint256 delegationsTotal;
        // delegator data for this collator
        DelegationsData[] topActiveDelegations; // excludes decreases and revokes
        // DelegationsData[] bottomDelegations;
        // DelegationsData[] topDelegations;
        // ScheduledRequestsData[] scheduledRequests;
    }

    struct OracleData {
        // the total amount of MOVR staked
        uint256 totalStaked;
        // the total count of desired collators, excluding orbiters
        uint128 totalSelected;
        // the target count of collators with orbiters
        uint128 orbitersCount;
        // the data snapshot is from the last block of this round, and the block data
        uint128 round;
        bytes32 blockHash;
        uint128 blockNumber;
        // total number of points awarded in this round
        uint128 awarded;
        // collator data for all candidates
        CollatorData[] collators;

        /*
        bytes32 stashAccount;
        bytes32 controllerAccount;
        LedgerStatus stakeStatus;
        // active part of stash balance
        uint128 activeBalance;
        // locked for stake stash balance.
        uint128 totalBalance;
        // totalBalance = activeBalance + sum(unlocked.balance)
        UnlockingChunk[] unlocking;
        uint32[] claimedRewards;
        // stash account balance. It includes locked (totalBalance) balance assigned
        // to a controller.
        uint128 stashBalance;
        // slashing spans for ledger
        uint32 slashingSpans;
        */
    }

    struct RelaySpec {
        uint16 maxValidatorsPerLedger;
        uint128 minNominatorBalance;
        uint128 ledgerMinimumActiveBalance;
        uint256 maxUnlockingChunks;
    }
}
