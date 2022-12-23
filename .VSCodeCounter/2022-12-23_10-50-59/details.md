# Details

Date : 2022-12-23 10:50:59

Directory f:\\PROJECTS\\GITHUB PROJECTS\\moonriver-delegator-cover-contract

Total : 41 files,  1024649 codes, 1173 comments, 738 blanks, all 1026560 lines

[Summary](results.md) / Details / [Diff Summary](diff.md) / [Diff Details](diff-details.md)

## Files
| filename | language | code | comment | blank | total |
| :--- | :--- | ---: | ---: | ---: | ---: |
| [.env](/.env) | Properties | 10 | 0 | 0 | 10 |
| [.soliumrc.json](/.soliumrc.json) | JSON | 20 | 0 | 0 | 20 |
| [README.md](/README.md) | Markdown | 60 | 0 | 26 | 86 |
| [contracts/AuthManager.sol](/contracts/AuthManager.sol) | Solidity | 79 | 39 | 22 | 140 |
| [contracts/DepositStaking.sol](/contracts/DepositStaking.sol) | Solidity | 190 | 86 | 34 | 310 |
| [contracts/InactivityCover.sol](/contracts/InactivityCover.sol) | Solidity | 604 | 339 | 82 | 1,025 |
| [contracts/Migrations.sol](/contracts/Migrations.sol) | Solidity | 14 | 1 | 5 | 20 |
| [contracts/Oracle.sol](/contracts/Oracle.sol) | Solidity | 165 | 60 | 27 | 252 |
| [contracts/OracleMaster.sol](/contracts/OracleMaster.sol) | Solidity | 317 | 183 | 57 | 557 |
| [contracts/artifacts/InactivityCover.json](/contracts/artifacts/InactivityCover.json) | JSON | 25,776 | 0 | 0 | 25,776 |
| [contracts/artifacts/InactivityCover_metadata.json](/contracts/artifacts/InactivityCover_metadata.json) | JSON | 1,189 | 0 | 0 | 1,189 |
| [contracts/artifacts/OracleMaster.json](/contracts/artifacts/OracleMaster.json) | JSON | 17,617 | 0 | 0 | 17,617 |
| [contracts/artifacts/OracleMaster_metadata.json](/contracts/artifacts/OracleMaster_metadata.json) | JSON | 612 | 0 | 0 | 612 |
| [contracts/artifacts/build-info/2d4b0113d4e685239bccf31926e7d90b.json](/contracts/artifacts/build-info/2d4b0113d4e685239bccf31926e7d90b.json) | JSON | 219,816 | 0 | 0 | 219,816 |
| [contracts/artifacts/build-info/403c9f1bcf3ade99994a12c700423f77.json](/contracts/artifacts/build-info/403c9f1bcf3ade99994a12c700423f77.json) | JSON | 219,816 | 0 | 0 | 219,816 |
| [contracts/artifacts/build-info/53c75466a0d2c84bf68ac70715555995.json](/contracts/artifacts/build-info/53c75466a0d2c84bf68ac70715555995.json) | JSON | 76,688 | 0 | 0 | 76,688 |
| [contracts/artifacts/build-info/eb7e5de63a531f557a08555f261ffe51.json](/contracts/artifacts/build-info/eb7e5de63a531f557a08555f261ffe51.json) | JSON | 219,280 | 0 | 0 | 219,280 |
| [contracts/artifacts/build-info/f5cb95c4c72ffa628fdfc07dc2bce992.json](/contracts/artifacts/build-info/f5cb95c4c72ffa628fdfc07dc2bce992.json) | JSON | 219,790 | 0 | 0 | 219,790 |
| [contracts/mocks/DepositStaking_mock.sol](/contracts/mocks/DepositStaking_mock.sol) | Solidity | 7 | 1 | 2 | 10 |
| [contracts/mocks/InactivityCover_mock.sol](/contracts/mocks/InactivityCover_mock.sol) | Solidity | 71 | 3 | 19 | 93 |
| [contracts/mocks/OracleMaster_mock.sol](/contracts/mocks/OracleMaster_mock.sol) | Solidity | 35 | 1 | 10 | 46 |
| [contracts/mocks/Transparent_mock.sol](/contracts/mocks/Transparent_mock.sol) | Solidity | 9 | 1 | 3 | 13 |
| [contracts/utils/Encoding.sol](/contracts/utils/Encoding.sol) | Solidity | 40 | 10 | 4 | 54 |
| [contracts/utils/ReportUtils.sol](/contracts/utils/ReportUtils.sol) | Solidity | 14 | 5 | 4 | 23 |
| [contracts/utils/WithdrawalQueue.sol](/contracts/utils/WithdrawalQueue.sol) | Solidity | 90 | 37 | 11 | 138 |
| [interfaces/IAuthManager.sol](/interfaces/IAuthManager.sol) | Solidity | 6 | 1 | 3 | 10 |
| [interfaces/IOracle.sol](/interfaces/IOracle.sol) | Solidity | 11 | 1 | 8 | 20 |
| [interfaces/IOracleMaster.sol](/interfaces/IOracleMaster.sol) | Solidity | 6 | 1 | 5 | 12 |
| [interfaces/IProxy.sol](/interfaces/IProxy.sol) | Solidity | 32 | 28 | 7 | 67 |
| [interfaces/IPushable.sol](/interfaces/IPushable.sol) | Solidity | 5 | 1 | 5 | 11 |
| [interfaces/StakingInterface.sol](/interfaces/StakingInterface.sol) | Solidity | 88 | 143 | 37 | 268 |
| [interfaces/Types.sol](/interfaces/Types.sol) | Solidity | 51 | 50 | 11 | 112 |
| [migrations/1_initial_migration.js](/migrations/1_initial_migration.js) | JavaScript | 4 | 0 | 2 | 6 |
| [migrations/2_deploy_contracts.js](/migrations/2_deploy_contracts.js) | JavaScript | 118 | 8 | 21 | 147 |
| [package-lock.json](/package-lock.json) | JSON | 19,779 | 0 | 1 | 19,780 |
| [package.json](/package.json) | JSON | 27 | 0 | 1 | 28 |
| [release-version.json](/release-version.json) | JSON | 1 | 0 | 0 | 1 |
| [remix-compiler.config.js](/remix-compiler.config.js) | JavaScript | 14 | 0 | 0 | 14 |
| [test/test_DepositStaking.js](/test/test_DepositStaking.js) | JavaScript | 406 | 7 | 67 | 480 |
| [test/test_InactivityCover.js](/test/test_InactivityCover.js) | JavaScript | 1,721 | 157 | 257 | 2,135 |
| [truffle-config.js](/truffle-config.js) | JavaScript | 71 | 10 | 7 | 88 |

[Summary](results.md) / Details / [Diff Summary](diff.md) / [Diff Details](diff-details.md)