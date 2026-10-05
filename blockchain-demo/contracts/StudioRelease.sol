// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Immutable certificate of a specific accepted video version.
/// @dev This records a claim and token ownership, not an automatic copyright transfer.
contract StudioRelease is ERC721, Ownable, Pausable, ReentrancyGuard {
    struct Passport { bytes32 releaseId; bytes32 videoHash; bytes32 metadataHash; bytes32 termsHash; }
    uint256 public nextTokenId = 1;
    mapping(bytes32 => uint256) public tokenByRelease;
    mapping(bytes32 => uint256) public tokenByVideo;
    mapping(uint256 => Passport) public passports;
    mapping(uint256 => string) private uris;
    event ReleaseCertified(uint256 indexed tokenId, bytes32 indexed releaseId, address indexed recipient,
        bytes32 videoHash, bytes32 metadataHash, bytes32 termsHash);
    error InvalidPassport();
    error DuplicateRelease();

    constructor(address admin) ERC721("AIMmontag Video Passport", "AIMVP") Ownable(admin) {}

    function mintRelease(bytes32 releaseId, address recipient, bytes32 videoHash,
        bytes32 metadataHash, bytes32 termsHash, string calldata uri, uint256 deadline) external onlyOwner whenNotPaused nonReentrant {
        if (releaseId == 0 || recipient == address(0) || videoHash == 0 || metadataHash == 0 ||
            termsHash == 0 || bytes(uri).length == 0 || bytes(uri).length > 2048 ||
            block.timestamp > deadline || deadline > block.timestamp + 1 hours) revert InvalidPassport();
        if (tokenByRelease[releaseId] != 0 || tokenByVideo[videoHash] != 0) revert DuplicateRelease();
        uint256 tokenId = nextTokenId++;
        tokenByRelease[releaseId] = tokenId;
        tokenByVideo[videoHash] = tokenId;
        passports[tokenId] = Passport(releaseId, videoHash, metadataHash, termsHash);
        uris[tokenId] = uri;
        _safeMint(recipient, tokenId);
        emit ReleaseCertified(tokenId, releaseId, recipient, videoHash, metadataHash, termsHash);
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return uris[tokenId];
    }
    // Incident pause stops issuance only. Owners retain normal ERC721 transfer rights.
    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }
}
