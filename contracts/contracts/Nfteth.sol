// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Burnable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "hardhat/console.sol";

contract Nfteth is ERC721, ERC721Burnable {
    using SafeERC20 for IERC20;

    struct Data {
        address token;
        uint amount;
        bool burned;
    }

    address public owner;
    uint public tokenIdsCounter;

    mapping(address => bool) public acceptedTokens;
    mapping(uint => Data) public nftsData;

    event AcceptedTokens(address[] tokens);
    event Minted(uint tokenId);
    event Withdrawn(address recipient, address token, uint amount);

    error OnlyOwner();
    error OnlyNftOwner();
    error NotEnoughBalance();
    error NotEnoughAllowance();
    error UnacceptedToken();
    error NftAlreadyBurned();

    constructor(
        string memory _name_, 
        string memory _symbol_
    ) ERC721(_name_, _symbol_) {
        owner = _msgSender();
        tokenIdsCounter = 1;
    }

    function addAcceptedTokens(address[] calldata _acceptedTokens) 
        external
    {
        if(owner != _msgSender()) revert OnlyOwner();

        for(uint _i=0; _i<_acceptedTokens.length; ){
            acceptedTokens[_acceptedTokens[_i]] = true;
            unchecked {
                ++_i;
            }
        }

        emit AcceptedTokens(_acceptedTokens);
    }

    function mint(address _token, uint _amount) 
        external
    {
        if(acceptedTokens[_token] != true) revert UnacceptedToken();

        IERC20 _paymentToken = IERC20(_token);
        address _sender = _msgSender();

        if(_paymentToken.balanceOf(_sender) < _amount) revert NotEnoughBalance();
        if(_paymentToken.allowance(_sender, address(this)) < _amount) revert NotEnoughAllowance();

        _paymentToken.safeTransferFrom(_sender, address(this), _amount);
        super._mint(_sender, tokenIdsCounter);

        nftsData[tokenIdsCounter] = Data(_token, _amount, false);

        emit Minted(tokenIdsCounter);

        unchecked{ 
            ++tokenIdsCounter;
        }
    }

    function burn(uint _tokenId)
        public virtual override
    {
        address _sender = _msgSender();
        if(ERC721.ownerOf(_tokenId) != _sender) revert OnlyNftOwner();
        if(nftsData[_tokenId].burned == true) revert NftAlreadyBurned();

        nftsData[_tokenId].burned = true;
        super.burn(_tokenId);

        IERC20 _withdrawToken = IERC20(nftsData[_tokenId].token);
        _withdrawToken.safeTransfer(_sender, nftsData[_tokenId].amount);

        emit Withdrawn(_sender, nftsData[_tokenId].token, nftsData[_tokenId].amount);
    }
}