// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./Types.sol";

interface IInactivityCover {

    function depositCover(address collator) external payable;
    function scheduleDecreaseCover(uint256 amount) external;
    function scheduleDecreaseCoverManager(uint256 amount, address member) external;
    function withdrawRewards(uint256 amount, address payable receiver) external;
    function executeScheduled(address payable collator) external;
    function cancelDecreaseCover() external;
    function pushData(uint64 _eraId, Types.OracleData calldata _report) external;
    function payOutCover(address payable[] calldata delegators, address[] calldata collators) external;
    function setMinDeposit(uint256 _min_deposit) external;
    function setMaxDepositTotal(uint256 _max_deposit_total) external;
    function setExecuteDelay(uint128 _execute_delay, address member) external;
    function setStakeUnitCover(uint256 _stake_unit_cover) external;
    function setMinPayout(uint256 _min_payout) external;
    function whitelist(address newMember) external;
    function whitelistRemove(address newMember) external;
}