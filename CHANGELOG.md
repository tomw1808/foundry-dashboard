# Changelog

## [1.2.0](https://github.com/tomw1808/foundry-dashboard/compare/v1.1.5...v1.2.0) (2025-05-14)


### Features

* Add ConnectButton to DashboardHeader ([01262d9](https://github.com/tomw1808/foundry-dashboard/commit/01262d901e9f72aef2c7e9959734c8ca01821d55))
* Add contract address to receipt and log receipt details ([e89fc3c](https://github.com/tomw1808/foundry-dashboard/commit/e89fc3c6ea37b5fc6dac4d66a5dd0d236cd2e6d4))
* Add EIP-7702 support for signing messages ([a162163](https://github.com/tomw1808/foundry-dashboard/commit/a1621631c1dc4c7d7ea3f95f920dd26297d78363))
* Add EIP-7702 toggle and initial logic branching ([7020226](https://github.com/tomw1808/foundry-dashboard/commit/70202263e322dae89705af7608675128171a81dc))
* Add EIP-7702 UI components and viem account functions ([d81b1b3](https://github.com/tomw1808/foundry-dashboard/commit/d81b1b395c0e511799c47af16fd1db1400064435))
* Add logging to debug contract creation event detection ([d555384](https://github.com/tomw1808/foundry-dashboard/commit/d5553849a7f8a8a81626e141ae859e60cb3474a3))
* Add option to persist EIP-7702 private key in local storage ([31ebe0b](https://github.com/tomw1808/foundry-dashboard/commit/31ebe0b7b0b8d75ac03a98061de443b50497ab85))
* added button, input and tabs shadcn components ([b4660bd](https://github.com/tomw1808/foundry-dashboard/commit/b4660bd0d9d62c6809aa14db43c61576d2bb58e1))
* added shadcn ([138b18e](https://github.com/tomw1808/foundry-dashboard/commit/138b18e244dd579f8df6d5df2cc0b5d7df5bccad))
* Create EIP7702.md with implementation steps for EIP-7702 ([c00c242](https://github.com/tomw1808/foundry-dashboard/commit/c00c242a2576dff3086f0da1de2d2fc8256da711))
* Create REFACTORAPPTSX.md with App.tsx refactoring steps ([1443475](https://github.com/tomw1808/foundry-dashboard/commit/1443475a4153fb04fbb400b1908afa681740d727))
* Create UserOperation with RPC from publicClient or fallback ([615979b](https://github.com/tomw1808/foundry-dashboard/commit/615979b86a2ccfa71f85bd369c3b0a61969bdd8f))
* Enable contract creation via createContract in EIP-7702 mode ([e48f168](https://github.com/tomw1808/foundry-dashboard/commit/e48f168cce4b7a071367ef253012158fe3d38efb))
* Enhance EIP-7702 mode display with settings and descriptions ([9788cdb](https://github.com/tomw1808/foundry-dashboard/commit/9788cdb0f3fb6a4d80312725681166280673902d))
* Enhance EIP-7702 tx display and use env vars for Candide URLs ([2f5c53a](https://github.com/tomw1808/foundry-dashboard/commit/2f5c53aff15b9a6699a6dd0ec0acda411c3fdff4))
* Harmonize address and forge command display, add accordion ([1aa41af](https://github.com/tomw1808/foundry-dashboard/commit/1aa41afdcb7d8dee1225b41cb2dd69e066bf2056))
* Implement EIP-7702 authorization signing and data preparation ([70b208a](https://github.com/tomw1808/foundry-dashboard/commit/70b208ab703232951d19dead0a2c6b066938c9a9))
* Implement EIP-7702 config check and error handling ([a90ee9c](https://github.com/tomw1808/foundry-dashboard/commit/a90ee9c797c5d518d76043722bb20f6c6e05a5ac))
* Implement EIP-7702 flow with Simple7702Account instantiation ([9364037](https://github.com/tomw1808/foundry-dashboard/commit/9364037d29b09da3710e730d4ff83b46ec4b156c))
* Implement EIP-7702 session and contract creation flow ([3a9d363](https://github.com/tomw1808/foundry-dashboard/commit/3a9d36330501b8b5e4e38aac660e660c03c7c8cb))
* Implement EIP-7702 support with placeholder logic in App.tsx ([1a7924b](https://github.com/tomw1808/foundry-dashboard/commit/1a7924b34978591c554d54976174911af6bb356d))
* Implement paymaster sponsorship using CandidePaymaster ([9bbf5bf](https://github.com/tomw1808/foundry-dashboard/commit/9bbf5bfd8a397683dbf324b63c2db0d721eb43e5))
* Implement sending UserOperation to bundler in EIP-7702 flow ([092a033](https://github.com/tomw1808/foundry-dashboard/commit/092a033b607f3b2fe5bb2796767fe67850cebe9a))
* Implement tabbed UI and EIP7702 session key generation ([018061a](https://github.com/tomw1808/foundry-dashboard/commit/018061a69960ff9d6fe4d7d699000dbfe32ad2cb))
* Implement UserOp creation, paymaster, signing, sending, tracking ([6b9a0ae](https://github.com/tomw1808/foundry-dashboard/commit/6b9a0ae992d72e9db26f796375b35362e1533373))
* Improve layout, add CreateX helper, browser wallet connect ([1ce32ad](https://github.com/tomw1808/foundry-dashboard/commit/1ce32ad9559586485e2d979788b8853141bbde91))
* Improve pending action list UI with processing state ([0c6e244](https://github.com/tomw1808/foundry-dashboard/commit/0c6e2441b4e4fa5f7efeb416c26b8e628c775e2c))
* Improve transaction receipt polling with specific error handling ([3a5acb8](https://github.com/tomw1808/foundry-dashboard/commit/3a5acb82b74d54233436643f8aa850e14fa894bf))
* Intercept eth_getTransactionReceipt for EIP-7702 deployments ([6c8a5b5](https://github.com/tomw1808/foundry-dashboard/commit/6c8a5b5c53068d5a08ded16eba954027b841e987))
* Move RainbowKit ConnectButton to DashboardHeader component ([3462069](https://github.com/tomw1808/foundry-dashboard/commit/3462069ca14d86bff0ea97e6c5529baa5a0d7b97))
* Move request counter to header, remove DashboardStatus ([07ef6b6](https://github.com/tomw1808/foundry-dashboard/commit/07ef6b6b7a7a4e16bcbfcdb545733c97b27bbaac))
* Move websocket status to header with tooltip and status icon ([db9965a](https://github.com/tomw1808/foundry-dashboard/commit/db9965a7db018d7326e30dbc4ba58cc1c66778bb))
* Persist and reselect active mode on reload, fallback if needed ([fdaad2b](https://github.com/tomw1808/foundry-dashboard/commit/fdaad2b861d3cf8054806fddf1137428a96685d1))
* Prepare MetaTransaction for EIP-7702 flow ([d4e6bfd](https://github.com/tomw1808/foundry-dashboard/commit/d4e6bfdff5f9c24b8b0b82121b13bb43d7741706))
* Refactor UI with tabs, EIP-7702 support, and status display ([40a20b1](https://github.com/tomw1808/foundry-dashboard/commit/40a20b123c3982afac9d26bce328d0b1e94e90d4))
* Remove factory deployment tip from alert description ([d30bb33](https://github.com/tomw1808/foundry-dashboard/commit/d30bb339ad1b0f29f548c6ee29625e8e3d7bc0ed))
* Remove unused WsStatus import from App.tsx ([ad9c496](https://github.com/tomw1808/foundry-dashboard/commit/ad9c49638accdc75e09ec0fc452d1154d98bc968))
* Replace Circle icon with Network icon for WS status display ([d5f5b13](https://github.com/tomw1808/foundry-dashboard/commit/d5f5b1306ccc04526d064f1be9ed5e4492c176af))
* Return actual transaction hash to Foundry for EIP-7702 flow ([516e4f6](https://github.com/tomw1808/foundry-dashboard/commit/516e4f62b1fc18cccbe96d18dff84f14208f6c93))
* Sign UserOperation for Simple7702Account (EIP-7702 step 4.2.9) ([01755e1](https://github.com/tomw1808/foundry-dashboard/commit/01755e1a0902187924dc2deecdbbf1e0245a0371))
* Track EIP-7702 UserOperation inclusion and update UI state ([46f3324](https://github.com/tomw1808/foundry-dashboard/commit/46f33240aa44cc371367428bddae9907b3af8699))
* Update EIP-7702 description with Candide.dev info ([1d71440](https://github.com/tomw1808/foundry-dashboard/commit/1d714406bb23b5828012862c0282294364699079))


### Bug Fixes

* added known bundler/paymaster endpoint hardcoded in App.tsx ([79e3c0d](https://github.com/tomw1808/foundry-dashboard/commit/79e3c0d81bc47952ba015dbb842e5642f8d77c76))
* added missing components ([d00c8c1](https://github.com/tomw1808/foundry-dashboard/commit/d00c8c134e1b1500af34466023dbd51cd79e9cb9))
* Check EOA address for ContractCreated event in EIP-7702 flow ([18b0353](https://github.com/tomw1808/foundry-dashboard/commit/18b0353e3f0b62ddc0bf06eb2bc74ada07d5194f))
* Comment out EIP-7702 logic to resolve "Unexpected catch" error ([d7aee9e](https://github.com/tomw1808/foundry-dashboard/commit/d7aee9e89237c3c20306b3a1751ee4ba29ea67ed))
* Correct chainId type in EIP7702 session account auth ([1922137](https://github.com/tomw1808/foundry-dashboard/commit/1922137390e1a6abffbf9d2d3273f62715bf7deb))
* Correct EIP-7702 auth data for UserOp override in App.tsx ([76aa537](https://github.com/tomw1808/foundry-dashboard/commit/76aa5370b4881a908efb4ada724de42da471a9cc))
* Correct EIP7702 signature handling and update documentation ([0bd9eef](https://github.com/tomw1808/foundry-dashboard/commit/0bd9eef81fa0417cf5ac13f759a5dbf9e2009f9e))
* Correct EIP7702.md to specify MetaTransaction type origin ([6639997](https://github.com/tomw1808/foundry-dashboard/commit/663999797a05c4e361ba7dda8ec24c52363bba01))
* Correct MetaTransaction type and update EIP7702.md ([32988d7](https://github.com/tomw1808/foundry-dashboard/commit/32988d760589a419e76fa4ee38813e7d5fecdc49))
* Correct yParity assignment in EOA signature object ([4422f67](https://github.com/tomw1808/foundry-dashboard/commit/4422f673de7a8b81e7312b97a748b2337650e88e))
* createUserOperation ([138b18e](https://github.com/tomw1808/foundry-dashboard/commit/138b18e244dd579f8df6d5df2cc0b5d7df5bccad))
* Declare rpcUrlForSessionClient before its usage in useCallback ([6a502b8](https://github.com/tomw1808/foundry-dashboard/commit/6a502b85220194bb4193b389ddd5f52d99123966))
* Delegate nonce management to browser wallet for eth_sendTransaction ([b9c6ea2](https://github.com/tomw1808/foundry-dashboard/commit/b9c6ea2a83a1319353e2c29d51b3d1b8b01d4ddf))
* Ensure EIP7702 tx interception with up-to-date state. ([3038141](https://github.com/tomw1808/foundry-dashboard/commit/30381411d719b21a8e516781359668bea239a961))
* full eip7702 auth ([4709152](https://github.com/tomw1808/foundry-dashboard/commit/47091521da0d44133e89b73afc897560944eb27d))
* Handle BigInt serialization in JSON responses to prevent errors ([139e68e](https://github.com/tomw1808/foundry-dashboard/commit/139e68e94df9fd37a51bdd8001c7643b90950d28))
* Handle null, undefined, and string receipt types ([8c7159f](https://github.com/tomw1808/foundry-dashboard/commit/8c7159f6b3de4e02fb5ff17365ea755221a0de23))
* Handle TransactionReceiptNotFoundError in eth_getTransactionReceipt ([c7c990f](https://github.com/tomw1808/foundry-dashboard/commit/c7c990fbb842680d9d8fcf140f0042cce9c1158c))
* Improve EIP-7702 private key persistence with init tracking ([752ead5](https://github.com/tomw1808/foundry-dashboard/commit/752ead5007d354e14800ef0b98ca0f95b56e0960))
* Normalize receipt fields for Foundry compatibility ([8db1260](https://github.com/tomw1808/foundry-dashboard/commit/8db12609fcbbdac7ca4850588275811a4ce325b0))
* Pass correct tracked transactions state to component ([2d2b431](https://github.com/tomw1808/foundry-dashboard/commit/2d2b43194450c9b9b19b73b01bde414b9138e469))
* Prevent race condition in EIP-7702 key persistence logic ([f75b6b9](https://github.com/tomw1808/foundry-dashboard/commit/f75b6b92979f7dd2e38a0fa9ac52e66027ef416b))
* Prevent unnecessary re-run of key load/gen effect. ([1d220a0](https://github.com/tomw1808/foundry-dashboard/commit/1d220a08a32a6f58763dd54e9d960282432a9dc3))
* Prevent websocket reconnect loop by stabilizing onRpcRequest callback ([c754c3d](https://github.com/tomw1808/foundry-dashboard/commit/c754c3d21583cd99580fa1ed13603b348909e363))
* Remove unused setEip7702ConfigError and add console log ([65877be](https://github.com/tomw1808/foundry-dashboard/commit/65877be3074f94317ab3cd279db9008e5651b64f))
* Update event name from ContractDeployed to ContractCreated ([85f5c04](https://github.com/tomw1808/foundry-dashboard/commit/85f5c0413d58a2bacd8bad1aa5dc283601ac4ce2))
* Use bigint for chainId and nonce in eip7702Auth override ([4b263bf](https://github.com/tomw1808/foundry-dashboard/commit/4b263bf6bfb37a921156fa1cd0f13f2cfd3d3164))
* Use BigInt for yParity comparison to 0n in signature data ([b51453b](https://github.com/tomw1808/foundry-dashboard/commit/b51453bee857f5879cfc8002cc2d87bc54a9eff4))
* Use ref for EIP7702 session account to avoid stale closures ([0079533](https://github.com/tomw1808/foundry-dashboard/commit/007953393c9aba722dce1dda09852d4ccc9a40c7))
* Validate 'v' and calculate yParity for EIP-7702 authorization ([9b234ea](https://github.com/tomw1808/foundry-dashboard/commit/9b234ea7b85a0fab0f192ca0452a0edabac41b82))
* Viem low level signature ([3aeda78](https://github.com/tomw1808/foundry-dashboard/commit/3aeda78e6c156dbcfbe310d60eb8321bbeeeb484))

## [1.1.5](https://github.com/tomw1808/foundry-dashboard/compare/v1.1.4...v1.1.5) (2025-05-06)


### Bug Fixes

* removed comments from json files ([13affc7](https://github.com/tomw1808/foundry-dashboard/commit/13affc7b76f17ebd84b7affb82364f02504f75a4))

## [1.1.4](https://github.com/tomw1808/foundry-dashboard/compare/v1.1.3...v1.1.4) (2025-05-05)


### Bug Fixes

* move pino-pretty into dependencies ([004ba82](https://github.com/tomw1808/foundry-dashboard/commit/004ba8283123a16b85eb8e2155649a60b9aedc9f))

## [1.1.3](https://github.com/tomw1808/foundry-dashboard/compare/v1.1.2...v1.1.3) (2025-05-05)


### Bug Fixes

* added yargs ([4360a9b](https://github.com/tomw1808/foundry-dashboard/commit/4360a9be446ca2bea64f1cbe8f88a4d8b12c12eb))

## [1.1.2](https://github.com/tomw1808/foundry-dashboard/compare/v1.1.1...v1.1.2) (2025-05-05)


### Bug Fixes

* Linter Error for BlockTag Type from Viem ([3124d91](https://github.com/tomw1808/foundry-dashboard/commit/3124d917750f1339336825a6b43b95c7c8b6d6c8))

## [1.1.1](https://github.com/tomw1808/foundry-dashboard/compare/v1.1.0...v1.1.1) (2025-05-05)


### Bug Fixes

* github npm release action missing installed node_modules ([26b437b](https://github.com/tomw1808/foundry-dashboard/commit/26b437b49c6977e5ed1a4e8a5b26762deaa5ce16))

## [1.1.0](https://github.com/tomw1808/foundry-dashboard/compare/v1.0.1...v1.1.0) (2025-05-05)


### Features

* automatic npm publishing ([a8e1a59](https://github.com/tomw1808/foundry-dashboard/commit/a8e1a598de45f4400cde7ca3835198be3df1217f))

## [1.0.1](https://github.com/tomw1808/foundry-dashboard/compare/v1.0.0...v1.0.1) (2025-05-05)


### Bug Fixes

* updated the release type to node ([f445f74](https://github.com/tomw1808/foundry-dashboard/commit/f445f743b95f2e511c442c9ad462e977388417b0))

## 1.0.0 (2025-05-05)


### Features

* Add Base, Base Sepolia, Arbitrum, and Arbitrum Sepolia chains ([d54f2da](https://github.com/tomw1808/foundry-dashboard/commit/d54f2da20638a751efa94c0f92e7b7b484e47759))
* Add detailed logging for eth_getTransactionCount in frontend ([241aa1c](https://github.com/tomw1808/foundry-dashboard/commit/241aa1c03d081f3a122de5eded03098b6d4f8cb9))
* Add forge dashboard CLI tool and viem dependency ([06e5858](https://github.com/tomw1808/foundry-dashboard/commit/06e585861faad2643e1107b5ae28711593295bcd))
* Add project path parameter and argument parsing with yargs ([00481da](https://github.com/tomw1808/foundry-dashboard/commit/00481dac5f5774a3ef9a7a52f8ab4750d69f25ec))
* Add RainbowKit and TanStack Query dependencies ([4a59fb5](https://github.com/tomw1808/foundry-dashboard/commit/4a59fb519e99a4eaf6e41a1c0c23734e2eb903de))
* Add tx labels and copyable user address to the UI ([f5e6639](https://github.com/tomw1808/foundry-dashboard/commit/f5e663906e0a173a90da2ed6dc139b629371a6c7))
* Add viem dependency to package.json ([d789647](https://github.com/tomw1808/foundry-dashboard/commit/d7896472557226b2631ec2d15d00293ea329c5b4))
* added release-please into the release workflow ([1b94873](https://github.com/tomw1808/foundry-dashboard/commit/1b94873063e1b23380ae4040b3f09e9e43bc794e))
* Bypass viem for contract creation using window.ethereum ([805201a](https://github.com/tomw1808/foundry-dashboard/commit/805201a82f0a071f9e0eb85b90448e14d8e53853))
* Bypass viem for contract creation using window.ethereum.request ([8e159a7](https://github.com/tomw1808/foundry-dashboard/commit/8e159a7aa88e1558e5010fabf44fefe7ec6a70dd))
* Convert backend to TypeScript for type safety and maintainability ([8a22157](https://github.com/tomw1808/foundry-dashboard/commit/8a22157284d9675ae3d0a3054bbcbf24bb13acae))
* Convert BigInts to hex strings for direct transport request ([39f05fc](https://github.com/tomw1808/foundry-dashboard/commit/39f05fcd50a7c039e4122f8cb59d3120f6aa7f09))
* create package.json for the frontend with dependencies ([5803979](https://github.com/tomw1808/foundry-dashboard/commit/58039794bc8e2b5a9268aed8d94396b061cea8b9))
* Display argument names and types for decoded transactions ([dd42245](https://github.com/tomw1808/foundry-dashboard/commit/dd42245c48c5f48e36b9949b061a9888f3c3ed84))
* Display constructor args and truncate tx hash in request details ([e89b9e0](https://github.com/tomw1808/foundry-dashboard/commit/e89b9e0d22df16b953efa2c62a68e4d39f400a37))
* Enhance decoded info and update dependencies ([d1e5360](https://github.com/tomw1808/foundry-dashboard/commit/d1e53602c68c2c6e6b9ef1b761b887bf58e97053))
* Handle eth_getTransactionCount with wagmi for reliability ([5cc5eb0](https://github.com/tomw1808/foundry-dashboard/commit/5cc5eb007c499554c5a8df8dc9946967e74fffc8))
* Implement backend decoding of transaction data using viem ([823fc05](https://github.com/tomw1808/foundry-dashboard/commit/823fc05997090066c3751e6c9d146eda16ab1fd4))
* Implement configurable logging levels with pino and verbosity flags ([bf9a4cc](https://github.com/tomw1808/foundry-dashboard/commit/bf9a4cc6aa76ed86dbcd23896549af98d7b197ce))
* Implement eth_sendTransaction signing flow with frontend UI ([a66cdbd](https://github.com/tomw1808/foundry-dashboard/commit/a66cdbdf18bd41164c2f7012f593ace41496d976))
* Implement transaction tracking feature in the client ([6df4b3c](https://github.com/tomw1808/foundry-dashboard/commit/6df4b3c090b4a0a228ca7355bae16441169e70b7))
* Implement WebSocket-based RPC forwarding with signing support ([9d4cb69](https://github.com/tomw1808/foundry-dashboard/commit/9d4cb6907ede053cc3d1cee167e3e119a8306bc6))
* Integrate wallet client and signing request state in App.tsx ([6b80fec](https://github.com/tomw1808/foundry-dashboard/commit/6b80fec902c5e90b2656b79f409243c0b9ba23ae))
* Map rawTx.input to sanitizedTx.data, fallback to rawTx.data ([6896250](https://github.com/tomw1808/foundry-dashboard/commit/6896250180c559d0fa7ffe092cee4de62775c0eb))
* Proxy RPC calls to frontend, handle responses via WebSocket ([327c4a6](https://github.com/tomw1808/foundry-dashboard/commit/327c4a6432ce7314c04af020a75a82a7b4b2787e))
* Remove RPC forwarding logic from HTTP endpoint ([f151a35](https://github.com/tomw1808/foundry-dashboard/commit/f151a354d6e922263c13e270188185090d7a1f52))
* Remove server address check and simplify port resolution ([87dd820](https://github.com/tomw1808/foundry-dashboard/commit/87dd8206ef4b11cc8e01088f96f8d047f76b8b41))
* scaffold express backend with websocket and rpc handling ([9311742](https://github.com/tomw1808/foundry-dashboard/commit/93117426e1429e38eadc2910c5271c997e8584c8))
* Setup React client with Vite, TS, Tailwind, RainbowKit ([0879512](https://github.com/tomw1808/foundry-dashboard/commit/08795123cda4be916fb6b260ffc3558089d1b0e6))
* Track transaction status with confirmations and explorer links ([208527e](https://github.com/tomw1808/foundry-dashboard/commit/208527e00865112e4bec6ed3d15eba87d2dd218c))


### Bug Fixes

* added image ([21d9f5e](https://github.com/tomw1808/foundry-dashboard/commit/21d9f5e114285b230e237725762655fa6ced7597))
* Correct key name in JSON.stringify for linter in App.tsx ([ae234bc](https://github.com/tomw1808/foundry-dashboard/commit/ae234bc724ef3d9dcb125faa0cd7cfe34d779b7a))
* Correct nonce conversion and comment out contract creation code ([fe782df](https://github.com/tomw1808/foundry-dashboard/commit/fe782df64edd8d8f07dc211beca8ce8b26e7b42c))
* Correct type annotation for blockNumber in useWatchBlockNumber ([0ba472b](https://github.com/tomw1808/foundry-dashboard/commit/0ba472b6ac68b72dd8f80c7c88d500c7989a7d36))
* Correctly handle ABI functions without inputs in RPC decoding ([1dd4d1e](https://github.com/tomw1808/foundry-dashboard/commit/1dd4d1e0e39581c6d9910fc1f9db293e5e3ba097))
* Ensure WebSocket is open when sending RPC responses ([99e82bd](https://github.com/tomw1808/foundry-dashboard/commit/99e82bd65160dea0948899879668d74fb41d0be0))
* Fix type error for constructorArgs assignment in server.ts ([dcc61e0](https://github.com/tomw1808/foundry-dashboard/commit/dcc61e0b8776bb08897d30f4318ee877900efe3b))
* Handle contract creation and data/input fields correctly ([695c4cf](https://github.com/tomw1808/foundry-dashboard/commit/695c4cf6856d78c7b93032d34fafce789d36c0d6))
* Handle empty argsData in /api/rpc endpoint ([92438c5](https://github.com/tomw1808/foundry-dashboard/commit/92438c5b71869176afc047d66319c48c48de92d8))
* Handle null 'to' address correctly for contract creation ([bfa47c5](https://github.com/tomw1808/foundry-dashboard/commit/bfa47c5ce318da9a93b4ea24dc729322cd107838))
* Handle null 'to' address for contract creation transactions ([6cb64e5](https://github.com/tomw1808/foundry-dashboard/commit/6cb64e52c063fccdebe25cdceabbefcac34ffa17))
* Handle null/undefined 'to' in sendTransaction and sanitize input ([6741303](https://github.com/tomw1808/foundry-dashboard/commit/6741303ce724cad58196d3d9d1034e07f040bf38))
* Prioritize longest bytecode match for contract deployment decoding ([4cffe1b](https://github.com/tomw1808/foundry-dashboard/commit/4cffe1bf6d7e49e88caeb5610f016d03674cd3a2))
* Remove 'input' field from sanitizedTx to avoid duplication ([5dff12a](https://github.com/tomw1808/foundry-dashboard/commit/5dff12a7768e4d45cfa2ddf60989a47f3296e547))
* Remove extra closing brace in DecodedInfoBase interface ([b854db6](https://github.com/tomw1808/foundry-dashboard/commit/b854db619ec75fcfbd9b32de016cc42b2ddc137f))
* Sanitize transaction object for correct gas parameter types ([3ee563c](https://github.com/tomw1808/foundry-dashboard/commit/3ee563c11d34adca8e132abd21829dcea7e86f39))
* Set zero address for contract creation tx to satisfy viem validation ([3636fd1](https://github.com/tomw1808/foundry-dashboard/commit/3636fd1a1d509b485da645903d8ef491a874fe0e))
* Suppress unused variable warnings in JSON.stringify replacers ([eb1026d](https://github.com/tomw1808/foundry-dashboard/commit/eb1026d14608bb197ba9a406eea80c58b12a5384))
* updated the GitHub Repository with last changes to gitignore and added missing files ([73e8036](https://github.com/tomw1808/foundry-dashboard/commit/73e803638d4832c7caa5d98b6e6632818623d0b6))
* Use artifactsDir instead of dir in loadArtifacts function ([f4983b1](https://github.com/tomw1808/foundry-dashboard/commit/f4983b1422b58e90ffbab4aa2405df237287a079))
