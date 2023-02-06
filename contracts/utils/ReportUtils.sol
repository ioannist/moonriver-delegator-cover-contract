// SPDX-License-Identifier: MIT
pragma solidity ^0.8.3;
pragma abicoder v2;

// From LIDO liquid KSM contract
library ReportUtils {
    // last bytes used to count votes
    uint256 internal constant COUNT_OUTMASK =
        0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF00;

    /// @notice Check if the given reports are different, not considering the counter of the first
    function isDifferent(
        uint256 value,
        uint256 that
    ) internal pure returns (bool) {
        return (value & COUNT_OUTMASK) != that;
    }

    /// @notice Return the total number of votes recorded for the variant
    function getCount(uint256 value) internal pure returns (uint8) {
        return uint8(value);
    }
}
