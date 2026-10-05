// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Local sandbox currency. No monetary value and no public-network claim.
contract DemoCredit is ERC20 {
    constructor(address buyer, address seller) ERC20("AIMmontag Demo Credit", "DEMO") {
        _mint(buyer, 10000 * 10 ** decimals());
        _mint(seller, 10000 * 10 ** decimals());
    }
}
