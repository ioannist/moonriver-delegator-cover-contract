// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

interface Types {

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
        uint128 blockNumber;
        bytes32 blockHash;
        // total number of points awarded in this round
        uint128 awarded;
       // if finalize is true, there are no more data to send for the included collator/s -> eraNonce++ 
        bool finalize;
        // collator data for all candidates
        CollatorData[] collators;
    }
}
