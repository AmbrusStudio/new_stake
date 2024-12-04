// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

module e4c_staking::staking {

    use sui::balance::{Self,Balance};
    use sui::clock::Clock;
    use sui::event;
    use sui::coin::{Self,Coin};
    use e4c::e4c::E4C;
    use e4c_staking::config::{
        annualized_interest_rate_bp,
        get_staking_rule,
        staking_quantity_range,
        staking_reward,
        StakingConfig, AdminCap};

    // === Errors ===
    const EStakingQuantityTooLow: u64 = 0;
    const EStakingQuantityTooHigh: u64 = 1;
    const EStakingTimeNotEnded: u64 = 2;
    const EAmountMustBeGreaterThanZero: u64 = 3;
    const EAmountTooHigh: u64 = 4;

    /// [Owned Object]: StakingReceipt represents a receipt of staked tokens.
    /// The receipt will have complete setup upon creation including rewards since it's fixed.
    /// Once it's created, you can only unstake the tokens when the staking time is ended.
    public struct StakingReceipt has key, store {
        id: UID,
        // Amount of tokens staked in the receipt
        amount_staked: Balance<E4C>,
        // Time when the receipt was created
        staked_at: u64,
        // Staking time in days for the receipt
        applied_staking_days: u64,
        // Interest rate applied to the staked tokens
        applied_interest_rate_bp: u16,
        // Time when the staking ends
        staking_end_at: u64,
        // Amount of rewards available for the stakers.
        // The rewards are calculated based on the staking time and the staked amount.
        // The amount is fixed when the receipt is created so put the rewards in the receipt at the creation time
        // so that user can avoid that the GameLiquidityPool are empty when the rewards are claimed
        reward: Balance<E4C>,
    }

    /// [Shared Object]: GameLiquidityPool is a store of minted E4C tokens.
    public struct GameLiquidityPool has key {
        id: UID,
        balance: Balance<E4C>,
        amount: u64,
    }

    /// Event emitted when a new staking receipt is created
    public struct Staked has copy, drop {
        receipt_id: ID,
        owner: address,
        amount: u64,
    }

    /// Event emitted when unstaking tokens from a receipt
    public struct Unstaked has copy, drop {
        receipt_id: ID,
        owner: address,
        amount: u64,
    }

    /// Event emitted when E4C tokens are placed in the GameLiquidityPool
    public struct PoolPlaced has copy, drop {
        sender: address,
        amount: u64,
    }

    /// Event emitted when E4C tokens are taken from the GameLiquidityPool
    public struct PoolWithdrawn has copy, drop {
        sender: address,
        amount: u64,
    }

    fun init(ctx: &mut TxContext) {
        transfer::share_object(
            GameLiquidityPool { id: object::new(ctx), balance: balance::zero(), amount: 0 }
        );
    }

    // == Public Functions ==

    /// Create a new staking receipt with the given stake and staking days.
    public fun new_staking_receipt(
        stake: Coin<E4C>,
        liquidity_pool: &mut GameLiquidityPool,
        clock: &Clock,
        config: &StakingConfig,
        staking_in_days: u64,
        ctx: &mut TxContext
    ): StakingReceipt {
        let detail = config.get_staking_rule(staking_in_days);
        let (min, max) = detail.staking_quantity_range();
        let amount = stake.value();
        assert!(amount > min, EStakingQuantityTooLow);
        assert!(amount <= max, EStakingQuantityTooHigh);   
        let staked_at = clock.timestamp_ms();
        let reward = config.staking_reward(staking_in_days, amount);
        let id = object::new(ctx);

        event::emit(Staked {
            receipt_id: id.to_inner(),
            owner: ctx.sender(),
            amount
        });
        liquidity_pool.amount =   liquidity_pool.amount + amount;

        StakingReceipt {
            id,
            amount_staked: stake.into_balance(),
            staked_at,
            applied_staking_days: staking_in_days,
            applied_interest_rate_bp: detail.annualized_interest_rate_bp(),
            staking_end_at: calculate_locking_time(staked_at, staking_in_days),
            reward: e4c_tokens_request(liquidity_pool, reward, ctx).into_balance()
        }
    }

    /// Unstake the tokens from the receipt.
    /// This function can be called only when the staking time is ended
    public fun unstake(
        receipt: StakingReceipt,
        clock: &Clock,
        ctx: &mut TxContext
    ): Coin<E4C> {
        assert!(
            receipt.staking_end_at <= clock.timestamp_ms(),
            EStakingTimeNotEnded
        );

        let StakingReceipt {
            id,
            amount_staked,
            staked_at: _,
            applied_staking_days: _,
            applied_interest_rate_bp: _,
            staking_end_at: _,
            reward
        } = receipt;

        event::emit(Unstaked {
            receipt_id: id.to_inner(),
            owner: ctx.sender(),
            amount: amount_staked.value() + reward.value()
        });

        id.delete();

        let mut total_reward_coin = amount_staked.into_coin(ctx);
        total_reward_coin.join(reward.into_coin(ctx));
        total_reward_coin
    }

    /// Put back E4C tokens to the GameLiquidityPool without capability check.
    /// This function can be called by anyone.
    public fun place_in_pool(liquidity_pool: &mut GameLiquidityPool, coin: Coin<E4C>, ctx: &mut TxContext) {
        assert!(coin.value() > 0, EAmountMustBeGreaterThanZero);

        event::emit(PoolPlaced {
            sender: ctx.sender(),
            amount: coin.value()
        });

        liquidity_pool.balance.join(coin.into_balance());
    }

    // === Private Functions ===

    public fun e4c_tokens_withdraw(
        _: &AdminCap,
        liquidity_pool: &mut GameLiquidityPool,
        amount: u64,
        ctx: &mut TxContext,
    ): Coin<E4C> {
        liquidity_pool.e4c_tokens_request(amount, ctx)
    }
    /// Take E4C tokens from the GameLiquidityPool without capability check.
    /// This function is only accessible to the friend module.
     fun e4c_tokens_request(
        liquidity_pool: &mut GameLiquidityPool,
        amount: u64,
        ctx: &mut TxContext
    ): Coin<E4C> {
        assert!(amount > 0, EAmountMustBeGreaterThanZero);
        assert!(amount <= liquidity_pool.balance.value(), EAmountTooHigh);

        event::emit(PoolWithdrawn {
            sender: ctx.sender(),
            amount
        });
        coin::take(&mut liquidity_pool.balance, amount, ctx)
    }

    /// Calculate the locking time in milliseconds
    ///     base_timestamp: the base timestamp in milliseconds
    ///     locking_days: the number of days to lock
    fun calculate_locking_time(
        base_timestamp: u64,
        locking_period_in_days: u64
    ): u64 {
        base_timestamp + locking_period_in_days * 24 * 60 * 60 * 1000
    }

    // === Public view Functions ===
    public fun game_liquidity_pool_balance(liquidity_pool: &GameLiquidityPool): u64 {
        liquidity_pool.balance.value()
    }

    public fun staking_receipt_amount(receipt: &StakingReceipt): u64 {
        receipt.amount_staked.value()
    }

    public fun staking_receipt_staked_at(receipt: &StakingReceipt): u64 {
        receipt.staked_at
    }

    public fun staking_receipt_applied_staking_days(receipt: &StakingReceipt): u64 {
        receipt.applied_staking_days
    }

    public fun staking_receipt_applied_interest_rate_bp(receipt: &StakingReceipt): u16 {
        receipt.applied_interest_rate_bp
    }

    public fun staking_receipt_staking_end_at(receipt: &StakingReceipt): u64 {
        receipt.staking_end_at
    }

    public fun staking_receipt_reward(receipt: &StakingReceipt): u64 {
        balance::value(&receipt.reward)
    }

    public fun staking_receipt_total_reward_amount(receipt: &StakingReceipt): u64 {
        receipt.amount_staked.value() + receipt.reward.value()
    }

    public fun staking_receipt_staking_remain_period(receipt: &StakingReceipt, clock: &Clock): u64 {
        let current = clock.timestamp_ms();
        let staking_end_at = receipt.staking_end_at;
        if (current < staking_end_at) {
            staking_end_at - current
        } else {
            0
        }   
    }

    // === Testing Functions ===

    #[test_only] use e4c_staking::config::init_for_testing as config_init;
    #[test_only]
    public fun init_for_testing(ctx: &mut TxContext) {
       init(ctx);
       config_init(ctx);
    }
}
