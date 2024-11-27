#!/bin/bash

# check dependencies are available.
for i in jq sui; do
  if ! command -V ${i} 2>/dev/null; then
    echo "${i} is not installed"
    exit 1
  fi
done

# default network is testnet
NETWORK="https://fullnode.testnet.sui.io:443"

# If otherwise specified chose testnet or devnet
if [ $# -ne 0 ]; then
  if [ $1 = "testnet" ]; then
    NETWORK="https://fullnode.testnet.sui.io:443"
  fi
  if [ $1 = "devnet" ]; then
    NETWORK="https://fullnode.devnet.sui.io:443"
  fi
fi

publish_res=$(sui client publish   --skip-dependency-verification  --gas-budget 200000000 --json ../e4c_staking)

echo ${publish_res} | jq '.' > .publish.res_e4c_staking.json
echo ${publish_res}
if [[ "$publish_res" =~ "error" ]]; then
  # If yes, print the error message and exit the script
  echo "Error during move contract publishing.  Details : $publish_res"
  exit 1
fi
echo "Contract Deployment finished!"


ADMIN_CAP_OBJECT_IDS=$(echo "${publish_res}" | jq -r '.objectChanges[] | select(.objectType | tostring | contains("::config::AdminCap")).objectId')
echo "config::AdminCap Object IDs : $ADMIN_CAP_OBJECT_IDS"

STAKING_CONFIG_OBJECT_IDS=$(echo "${publish_res}" | jq -r '.objectChanges[] | select(.objectType | tostring | contains("::config::StakingConfig")).objectId')
echo "config::StakingConfig Object ID : $STAKING_CONFIG_OBJECT_IDS"

GAME_LIQUIDITY_POOL_OBJECT_IDS=$(echo "${publish_res}" | jq -r '.objectChanges[] | select(.objectType | tostring | contains("::staking::GameLiquidityPool")).objectId')
echo " config::GameLiquidityPool Object ID : $GAME_LIQUIDITY_POOL_OBJECT_IDS"

PACKAGE_ID=$(echo "${publish_res}" | jq -r '.objectChanges[] | select(.type == "published").packageId')
echo "Extracted PACKAGE_ID: $PACKAGE_ID"


echo "Setting up environmental variables..."

DIGEST=$(echo "${publish_res}" | jq -r '.digest')

cat >src/.env.staking <<-API_ENV
SUI_NETWORK=$NETWORK
PUBLISH_DIGEST=$DIGEST
STAKING_PACKAGE=$PACKAGE_ID
GAME_LIQUIDITY_POOL=$GAME_LIQUIDITY_POOL_OBJECT_IDS
STAKING_CONFIG=$STAKING_CONFIG_OBJECT_IDS
ADMIN_CAP=$ADMIN_CAP_OBJECT_IDS
API_ENV
