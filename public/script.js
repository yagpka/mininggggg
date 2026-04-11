// ==========================================
// 1. SAFTEY CHECK & TELEGRAM OPTIMIZATION
// ==========================================
// Prevents the app from crashing if opened outside of Telegram
if (typeof window.Telegram === 'undefined' || !window.Telegram.WebApp || !window.Telegram.WebApp.initData) {
    window.Telegram = window.Telegram || {};
    window.Telegram.WebApp = {
        initDataUnsafe: { user: { id: 12345678, first_name: "LocalTester", username: "localtester" } },
        expand: function(){},
        ready: function(){},
        showAlert: function(msg){ window.alert(msg); },
        HapticFeedback: { impactOccurred: function(){} }
    };
}

const tg = window.Telegram.WebApp;

try { 
    tg.expand(); 
    tg.ready(); 
    
    // Telegram UI Optimizations
    if (tg.setHeaderColor) tg.setHeaderColor('#121418');
    if (tg.setBackgroundColor) tg.setBackgroundColor('#121418');
    if (tg.disableVerticalSwipes) tg.disableVerticalSwipes(); // Prevents annoying pull-to-refresh
} catch(e) { 
    console.log("TG API advanced features not available"); 
}

const tgUser = tg.initDataUnsafe?.user || { id: 12345678, first_name: "WebTester", username: "webtester" };

// Safe Haptic Feedback
function haptic(type = 'light') {
    try {
        if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred(type);
    } catch(e) {} // Ignore if device doesn't support it
}

// ✨ UNIVERSAL ALERT SYSTEM: Fixes the bug where alerts break in Telegram
function appAlert(message) {
    if (tg && typeof tg.showAlert === "function") {
        try {
            tg.showAlert(message);
        } catch (e) {
            window.alert(message);
        }
    } else {
        window.alert(message);
    }
}

// ==========================================
// 2. SUPABASE INITIALIZATION
// ==========================================
if (typeof window.supabase === 'undefined') {
    appAlert("🛑 ERROR: Supabase library failed to load. Make sure you are connected to the internet.");
}

const supabaseUrl = 'https://hljelrvailszfqcaerbg.supabase.co';
const supabaseKey = 'sb_publishable_u-HVI2Zq9Sf_ZhpflB1pjQ_o5KzUrbP';
const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);

// ==========================================
// 3. GAME CONSTANTS & GLOBAL STATS
// ==========================================
const TOTAL_POOL = 300000000;
const COINS_PER_1_GH_PER_DAY = 1;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MAX_HEAT_MS = 4 * 60 * 60 * 1000; // 4 Hours until overheat

let globalStats = {
    totalPlayers: 0,
    totalPower: 0,
    totalMined: 0
};

// ==========================================
// 4. STATE MANAGEMENT (Local Player)
// ==========================================
let state = {
    gh: 0, pendingCoins: 0, walletCoins: 0, totalMinedFromPool: 0,
    lives: 0, solAddress: "", lastCalcTime: Date.now(), heatMs: 0,               
    streakDays: 1, lastLoginDate: "", completedTasks: [],
    socialHistory: [] // Added to store their submission history    
};

// ==========================================
// 5. DB FETCH & SAVE SYSTEM
// ==========================================
async function fetchGlobalStats() {
    try {
        const { data, error, count } = await supabaseClient
            .from('players')
            .select('gh_power, total_mined', { count: 'exact' });

        if (error) throw error;

        if (data) {
            globalStats.totalPlayers = count || 1;
            globalStats.totalPower = data.reduce((sum, player) => sum + (Number(player.gh_power) || 0), 0);
            globalStats.totalMined = data.reduce((sum, player) => sum + (Number(player.total_mined) || 0), 0);
        }
    } catch (err) {
        console.error("Failed to fetch global stats:", err);
    }
}

async function loadGameData() {
    try {
        // 1. Fetch Player Data
        const { data, error } = await supabaseClient.rpc('get_or_create_player', {
            p_telegram_id: tgUser.id,
            p_first_name: tgUser.first_name || "Unknown",
            p_username: tgUser.username || "unknown"
        });

        if (error) throw error;

        if (data && data.length > 0) {
            const dbState = data[0];
            state.gh = Number(dbState.gh_power) || 0;
            state.pendingCoins = Number(dbState.pending_coins) || 0;
            state.walletCoins = Number(dbState.wallet_coins) || 0;
            state.totalMinedFromPool = Number(dbState.total_mined) || 0;
            state.lives = Number(dbState.lives) || 0;
            state.solAddress = dbState.sol_address || "";
            state.streakDays = Number(dbState.streak_days) || 1;
            state.lastLoginDate = dbState.last_login_date || "";
            state.heatMs = Number(dbState.heat_ms) || 0;
            state.lastCalcTime = Number(dbState.last_calc_time) || Date.now();
            state.completedTasks = dbState.completed_tasks || [];
        }

        // 2. Fetch Social Submission History
        const { data: socialData, error: socialErr } = await supabaseClient
            .from('social_submissions')
            .select('platform, status, rewarded_gh, created_at')
            .eq('telegram_id', tgUser.id)
            .order('created_at', { ascending: false });
            
        if (socialData && !socialErr) {
            state.socialHistory = socialData;
        }

    } catch (error) {
        console.warn("Supabase Load Error. Falling back to LocalStorage:", error);
        const savedState = localStorage.getItem(`minerState_${tgUser.id}`);
        if (savedState) {
            state = { ...state, ...JSON.parse(savedState) };
            if(!state.completedTasks) state.completedTasks = [];
            if(!state.socialHistory) state.socialHistory = [];
        }
    }

    await fetchGlobalStats();
    setInterval(fetchGlobalStats, 15000);

    // Process Referral if exists
    if (tg.initDataUnsafe && tg.initDataUnsafe.start_param) {
        const startParam = tg.initDataUnsafe.start_param;
        if (startParam.startsWith('ref_')) {
            const referrerId = startParam.replace('ref_', '');
            if (referrerId != tgUser.id) {
                await processReferral(referrerId);
            }
        }
    }

    const loader = document.getElementById('loading-screen');
    if(loader) loader.classList.add('hidden');
    
    processOfflineProgress();
    checkDailyStreak();
    showSocialModal(); // Shows the hype popup
    updateSocialHistoryUI(); // Renders the social history list
    loadReferralHistory(); // Load Frens history
    loadLeaderboards(); // Load Global Leaderboards
    updateUI();
    requestAnimationFrame(gameLoop);
}

let saveTimeout;
function saveState() {
    localStorage.setItem(`minerState_${tgUser.id}`, JSON.stringify(state));
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(forceSaveToDB, 3000); // 3 second debounce
}

async function forceSaveToDB() {
    try {
        await supabaseClient.from('players').upsert({
            telegram_id: tgUser.id, first_name: tgUser.first_name || "Unknown",
            username: tgUser.username || "unknown", gh_power: state.gh,
            pending_coins: state.pendingCoins, wallet_coins: state.walletCoins,
            total_mined: state.totalMinedFromPool, lives: state.lives,
            sol_address: state.solAddress, streak_days: state.streakDays,
            last_login_date: state.lastLoginDate, heat_ms: state.heatMs,
            last_calc_time: state.lastCalcTime, completed_tasks: state.completedTasks
        });
    } catch (err) {}
}

// ==========================================
// 6. OFFLINE PROGRESSION
// ==========================================
function processOfflineProgress() {
    const now = Date.now();
    const timeDiff = now - state.lastCalcTime;
    
    if (timeDiff > 0 && state.gh > 0 && globalStats.totalMined < TOTAL_POOL) {
        const timeUntilOverheat = MAX_HEAT_MS - state.heatMs;
        const effectiveMiningTime = Math.max(0, Math.min(timeDiff, timeUntilOverheat));
        
        const multiplier = 1.0 + Math.min(0.5, (state.streakDays - 1) * 0.1);
        const baseGen = (state.gh * COINS_PER_1_GH_PER_DAY) * (effectiveMiningTime / MS_PER_DAY);
        const coinsGenerated = baseGen * multiplier;

        state.pendingCoins += coinsGenerated;
        state.totalMinedFromPool += coinsGenerated; 
        state.heatMs = Math.min(MAX_HEAT_MS, state.heatMs + timeDiff);
    }
    state.lastCalcTime = now;
}

function checkDailyStreak() {
    const today = new Date().toISOString().split('T')[0];
    if (!state.lastLoginDate) {
        state.streakDays = 1; state.lastLoginDate = today;
    } else if (state.lastLoginDate !== today) {
        const lastDate = new Date(state.lastLoginDate);
        const currDate = new Date(today);
        const diffDays = Math.ceil(Math.abs(currDate - lastDate) / MS_PER_DAY); 
        
        if (diffDays === 1) state.streakDays += 1; 
        else if (diffDays > 1) state.streakDays = 1;  
        state.lastLoginDate = today;
    }
    forceSaveToDB(); 
}

// ==========================================
// 7. DOM SELECTORS
// ==========================================
const els = {
    gh: document.getElementById('gh-display'), dailyGen: document.getElementById('daily-gen-display'),
    streak: document.getElementById('streak-display'), heatPercent: document.getElementById('heat-percent-display'),
    heatFill: document.getElementById('heat-fill'), btnCooldown: document.getElementById('btn-cooldown'),
    pending: document.getElementById('pending-coins'), walletHeader: document.getElementById('header-wallet'),
    walletMain: document.getElementById('wallet-coins'), lives: document.getElementById('lives-display'),
    poolPercent: document.getElementById('pool-percent'), poolFill: document.getElementById('pool-fill'),
    withdrawProgress: document.getElementById('withdraw-progress'), poolRemainingWallet: document.getElementById('pool-remaining-wallet'),
    globalMined: document.getElementById('global-mined'), globalMinedFill: document.getElementById('global-mined-fill'),
    globalRemaining: document.getElementById('global-remaining'), globalRemainingFill: document.getElementById('global-remaining-fill'),
    globalPlayers: document.getElementById('global-players'), globalPower: document.getElementById('global-power'),
    btnClaim: document.getElementById('btn-claim'), btnWithdraw: document.getElementById('btn-withdraw'),
    withdrawStatusText: document.getElementById('withdraw-status-text'), solInput: document.getElementById('sol-address-input'),
    solDisplay: document.getElementById('display-sol-address')
};

// ==========================================
// 8. MAIN GAME LOOP
// ==========================================
function gameLoop() {
    const now = Date.now();
    const timeDiff = now - state.lastCalcTime;
    
    if (globalStats.totalMined < TOTAL_POOL && state.gh > 0 && timeDiff > 0) {
        if (state.heatMs < MAX_HEAT_MS) {
            const multiplier = 1.0 + Math.min(0.5, (state.streakDays - 1) * 0.1);
            const baseGenerated = (state.gh * COINS_PER_1_GH_PER_DAY) * (timeDiff / MS_PER_DAY);
            const coinsGenerated = baseGenerated * multiplier;
            
            state.pendingCoins += coinsGenerated;
            state.totalMinedFromPool += coinsGenerated;
            globalStats.totalMined += coinsGenerated;
        }
        state.heatMs = Math.min(MAX_HEAT_MS, state.heatMs + timeDiff);
    }
    
    const todayStr = new Date().toISOString().split('T')[0];
    if (state.lastLoginDate !== todayStr) checkDailyStreak();
    
    state.lastCalcTime = now;
    saveState(); 
    updateUI();
    requestAnimationFrame(gameLoop);
}

// ==========================================
// 9. UI UPDATER & CLAIM FIXES
// ==========================================
function updateUI() {
    els.gh.innerText = state.gh;
    els.pending.innerText = state.pendingCoins.toFixed(4);
    const formattedWallet = state.walletCoins.toFixed(2);
    els.walletHeader.innerText = formattedWallet;
    els.walletMain.innerText = formattedWallet;
    els.lives.innerText = state.lives;
    els.solDisplay.innerText = state.solAddress || "None";

    const multiplier = 1.0 + Math.min(0.5, (state.streakDays - 1) * 0.1);
    els.streak.innerText = `Day ${state.streakDays} (${multiplier.toFixed(1)}x)`;
    els.dailyGen.innerText = (state.gh * COINS_PER_1_GH_PER_DAY * multiplier).toFixed(2);

    const heatPercent = Math.min(100, (state.heatMs / MAX_HEAT_MS) * 100);
    els.heatPercent.innerText = heatPercent.toFixed(0) + "%";
    els.heatFill.style.width = `${heatPercent}%`;
    
    if (heatPercent >= 100) {
        els.heatPercent.innerText = "100% (OVERHEATED)";
        els.heatPercent.style.color = "var(--accent-red)";
        els.btnCooldown.classList.add('pulse');
    } else {
        els.heatPercent.style.color = "var(--text-muted)";
        els.btnCooldown.classList.remove('pulse');
    }

    const remaining = Math.max(0, TOTAL_POOL - globalStats.totalMined);
    const percentMined = (globalStats.totalMined / TOTAL_POOL) * 100;
    const percentRemaining = 100 - percentMined;
    
    els.poolRemainingWallet.innerText = Math.floor(remaining).toLocaleString();
    els.poolPercent.innerText = percentRemaining.toFixed(2) + "%";
    els.poolFill.style.width = `${percentRemaining}%`;
    els.withdrawProgress.style.width = `${percentMined}%`;

    els.globalMined.innerText = globalStats.totalMined.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
    els.globalRemaining.innerText = remaining.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
    els.globalMinedFill.style.width = `${percentMined}%`;
    els.globalRemainingFill.style.width = `${percentRemaining}%`;
    
    els.globalPlayers.innerText = globalStats.totalPlayers.toLocaleString(); 
    els.globalPower.innerText = globalStats.totalPower.toLocaleString() + " GH";
    
    // Update Phase 2 Progress
    const phase2Goal = 100;
    const phase2Current = Math.min(globalStats.totalPlayers, phase2Goal);
    const phase2Percent = (phase2Current / phase2Goal) * 100;
    const p2Text = document.getElementById('phase2-progress-text');
    const p2Fill = document.getElementById('phase2-progress-fill');
    if (p2Text) p2Text.innerText = `${phase2Current} / ${phase2Goal}`;
    if (p2Fill) p2Fill.style.width = `${phase2Percent}%`;
    
    if (globalStats.totalMined >= TOTAL_POOL) {
        els.btnWithdraw.className = "btn btn-action";
        els.withdrawStatusText.innerText = "Withdrawals Open!";
        els.withdrawStatusText.style.color = "var(--accent-yellow)";
    }

    checkClaimAvailability();
    updateTasksUI();
}

function checkClaimAvailability() {
    if (state.pendingCoins >= 0.9999) {
        els.btnClaim.classList.remove('btn-disabled');
        els.btnClaim.classList.add('btn-action');
        els.btnClaim.innerText = "Claim 🎁";
        els.btnClaim.disabled = false;
    } else {
        els.btnClaim.classList.remove('btn-action');
        els.btnClaim.classList.add('btn-disabled');
        els.btnClaim.innerText = "Need 1 Coin ⏳";
        els.btnClaim.disabled = true;
    }
}

function claimCoins() {
    if (state.pendingCoins < 0.9999) return;
    haptic('success');
    state.walletCoins += state.pendingCoins; 
    state.pendingCoins = 0;
    forceSaveToDB(); 
    updateUI();
    appAlert("Coins successfully added to your wallet!");
}

function switchTab(tabId) {
    haptic('light');
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.bottom-nav .nav-item').forEach(t => t.classList.remove('active'));
    document.getElementById(`${tabId}-tab`).classList.add('active');
    event.currentTarget.classList.add('active');
}

function switchSubTab(tabId) {
    haptic('light');
    document.querySelectorAll('.sub-tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.sub-nav-btn').forEach(t => t.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    event.currentTarget.classList.add('active');
}

function coolDownRig() {
    haptic('heavy');
    if (state.heatMs === 0) return appAlert("Rig is already cool!");
    state.heatMs = 0;
    forceSaveToDB();
    updateUI();
    appAlert("Rig Cooled! Mining resumed at max speed.");
}

function saveAddress() {
    const addr = els.solInput.value.trim();
    if (addr.length < 30 || addr.length > 50) return appAlert("Please enter a valid SOL address.");
    state.solAddress = addr;
    forceSaveToDB();
    updateUI();
    haptic('success');
    appAlert("SOL Address saved successfully!");
}

// ==========================================
// 10. TASKS UI
// ==========================================
function updateTasksUI() {
    const streakContainer = document.getElementById('streak-days-ui');
    if(!streakContainer) return;
    streakContainer.innerHTML = '';
    
    let startDay = Math.floor((state.streakDays - 1) / 7) * 7 + 1;
    for(let i = 0; i < 7; i++) {
        let dayNum = startDay + i;
        let isPast = dayNum < state.streakDays;
        let isToday = dayNum === state.streakDays;
        
        let statusClass = isToday ? 'active' : (isPast ? 'completed' : '');
        let icon = isPast ? '✓' : (isToday ? '🔥' : '🔒');
        
        streakContainer.innerHTML += `<div class="streak-day ${statusClass}"><div class="streak-icon">${icon}</div><span>Day ${dayNum}</span></div>`;
    }

    state.completedTasks.forEach(taskId => {
        const btn = document.getElementById('btn-task-' + taskId);
        if (btn && !btn.disabled) {
            btn.innerText = "Done ✓"; btn.className = "btn btn-disabled task-btn"; btn.disabled = true;
        }
    });
}

function completeTask(taskId, rewardType, rewardAmt, element) {
    if (state.completedTasks.includes(taskId)) return;
    element.innerText = "Checking..."; element.className = "btn btn-secondary task-btn"; element.disabled = true;

    setTimeout(() => {
        haptic('success');
        if (rewardType === 'gh') { state.gh += rewardAmt; appAlert(`Task Verified! +${rewardAmt} GH Power.`); } 
        else if (rewardType === 'coins') { state.walletCoins += rewardAmt; appAlert(`Task Verified! +${rewardAmt} Coins added to wallet.`); } 
        else if (rewardType === 'lives') { state.lives += rewardAmt; appAlert(`Task Verified! +${rewardAmt} Lives added.`); }
        
        state.completedTasks.push(taskId);
        if(rewardType === 'gh') fetchGlobalStats();
        
        forceSaveToDB(); 
        updateUI();
    }, 1500); 
}

// ==========================================
// 10.5 VIRAL SOCIAL MINING LOGIC
// ==========================================

function showSocialModal() {
    setTimeout(() => {
        const modal = document.getElementById('social-modal');
        if (modal) modal.classList.remove('hidden');
    }, 1000); 
}

function closeSocialModal() {
    haptic('light');
    const modal = document.getElementById('social-modal');
    if (modal) modal.classList.add('hidden');
}

function openReferralLeaderboard() {
    haptic('light');
    const modal = document.getElementById('referral-leaderboard-modal');
    if (modal) modal.classList.remove('hidden');
}

function closeReferralLeaderboard() {
    haptic('light');
    const modal = document.getElementById('referral-leaderboard-modal');
    if (modal) modal.classList.add('hidden');
}

function openPowerLeaderboard() {
    haptic('light');
    const modal = document.getElementById('power-leaderboard-modal');
    if (modal) modal.classList.remove('hidden');
}

function closePowerLeaderboard() {
    haptic('light');
    const modal = document.getElementById('power-leaderboard-modal');
    if (modal) modal.classList.add('hidden');
}

function copyTemplate() {
    haptic('light');
    const refLink = `https://t.me/miners_hub_bot?start=${tgUser.id}`;
    const template = `🚨 Found the ultimate hidden crypto gem! 🚨\n\n⛏️ Miners Hub just launched yesterday and early users are mining a massive 300,000,000 Coin Prize Pool completely for FREE.\n\nStart mining from your phone right now before the pool drains out! 💸👇\n\nPlay here: ${refLink}\n\n#MinersHub #CryptoMining #Airdrop #TelegramBot`;

    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(template).then(() => {
            appAlert("Template copied to clipboard! Don't forget to post it and submit your link below.");
        });
    } else {
        const textArea = document.createElement("textarea");
        textArea.value = template; 
        document.body.appendChild(textArea);
        textArea.focus(); 
        textArea.select();
        try { 
            document.execCommand('copy'); 
            appAlert("Template copied to clipboard! Don't forget to post it and submit your link below."); 
        } catch (err) { 
            appAlert("Copy failed. Please select the text and copy it manually."); 
        }
        document.body.removeChild(textArea);
    }
}

// Renders the History List in the UI
function updateSocialHistoryUI() {
    const historyContainer = document.getElementById('social-history-list');
    if (!historyContainer) return;
    
    historyContainer.innerHTML = ''; // Clear placeholder data

    if (!state.socialHistory || state.socialHistory.length === 0) {
        historyContainer.innerHTML = '<p style="font-size: 12px; color: var(--text-muted); text-align: center; padding: 10px;">No submissions yet. Submit a link above to earn GH/s!</p>';
        return;
    }

    state.socialHistory.forEach(item => {
        let statusClass = 'status-pending';
        let statusText = 'PENDING';
        let rewardText = '0 GH';
        let rewardClass = '';

        if (item.status === 'APPROVED') {
            statusClass = 'status-approved';
            statusText = 'APPROVED';
            rewardText = `+${item.rewarded_gh} GH`;
            rewardClass = 'highlight-yellow';
        } else if (item.status === 'REJECTED') {
            statusClass = 'status-rejected';
            statusText = 'REJECTED';
            rewardText = '0 GH';
        }

        const historyHTML = `
            <div class="history-item">
                <div class="history-info">
                    <span class="history-platform">${item.platform}</span>
                    <span class="status-badge ${statusClass}">${statusText}</span>
                </div>
                <div class="history-reward ${rewardClass}">${rewardText}</div>
            </div>
        `;
        historyContainer.innerHTML += historyHTML;
    });
}

async function submitSocialPost() {
    const platform = document.getElementById('social-platform').value;
    const url = document.getElementById('social-url').value.trim();

    if (!url) return appAlert("Please enter your post URL!");
    if (!url.startsWith('http')) return appAlert("Please enter a valid URL starting with http:// or https://");

    const btn = document.getElementById('btn-submit-social');
    btn.innerText = "Submitting..."; 
    btn.disabled = true;

    try {
        const { error } = await supabaseClient.from('social_submissions').insert([
            { telegram_id: tgUser.id, platform: platform, post_url: url }
        ]);

        if (error) throw error;
        
        haptic('success');
        appAlert("Success! Your post has been submitted. Our team will review your views and credit your GH/s within 24 hours!");
        document.getElementById('social-url').value = ''; 
        
        // Instantly add it to the top of the history list locally
        state.socialHistory.unshift({
            platform: platform,
            status: 'PENDING',
            rewarded_gh: 0,
            created_at: new Date().toISOString()
        });
        updateSocialHistoryUI(); // Re-render the list

    } catch (err) {
        console.error(err);
        appAlert("Submission failed! You might have already submitted today, or your link is invalid.");
    } finally {
        btn.innerText = "🚀 Submit for Review"; 
        btn.disabled = false;
    }
}


// ==========================================
// 11. ADSGRAM INTEGRATION (Rewarded Ads)
// ==========================================
let adBlockMining = null;
let adBlockLives = null;

if (window.Adsgram) {
    adBlockMining = window.Adsgram.init({ blockId: "int-26802" });
    adBlockLives = window.Adsgram.init({ blockId: "int-26801" });
}

function watchAd(type) {
    if (globalStats.totalMined >= TOTAL_POOL) return appAlert("Game Over! The 300M Pool is depleted.");
    haptic('medium');
    
    const currentAdBlock = (type === 'mining') ? adBlockMining : adBlockLives;

    if (currentAdBlock) {
        currentAdBlock.show().then((result) => {
            grantReward(type);
        }).catch((result) => {
            console.error("Adsgram Error:", result);
            appAlert("Ad was closed early or no ads available. Try again later.");
        });
    } else {
        appAlert("Ad system unavailable. Try again later.");
    }
}

function grantReward(type) {
    haptic('heavy');
    if (type === 'mining') { 
        state.gh += 10; 
        appAlert("+10 GH Power unlocked!"); 
        fetchGlobalStats(); 
    } 
    else if (type === 'lives') { state.lives += 5; appAlert("+5 Lives added!"); }
    forceSaveToDB();
    updateUI();
}

// ==========================================
// 12. MINIGAMES
// ==========================================
const gameMenu = document.getElementById('game-menu');
const game1Area = document.getElementById('game-1-area');
const game2Area = document.getElementById('game-2-area');

function exitGame() {
    haptic('light'); game1Area.classList.add('hidden'); game2Area.classList.add('hidden'); gameMenu.classList.remove('hidden');
}

function deductLife() {
    if (globalStats.totalMined >= TOTAL_POOL) { appAlert("Pool depleted!"); return false; }
    if (state.lives <= 0) { appAlert("No lives! Watch an ad to get more."); return false; }
    state.lives -= 1; forceSaveToDB(); updateUI(); return true;
}

let g1Active = false, g1Taps = 0, g1TimeLeft = 5.0, g1TimerInterval;
const G1_MAX_TAPS = 30;
const g1Inst = document.getElementById('g1-instruction'), g1Progress = document.getElementById('g1-progress');
const g1TimerText = document.getElementById('g1-timer'), g1Target = document.getElementById('g1-target');
const g1StartBtn = document.getElementById('g1-start-btn');

function initGame1() {
    haptic('light'); gameMenu.classList.add('hidden'); game1Area.classList.remove('hidden');
    g1Taps = 0; g1TimeLeft = 5.0; g1Progress.style.width = "0%"; g1TimerText.innerText = "5.0s";
    g1Inst.innerText = "Tap 30 times in 5 seconds!"; g1Target.classList.add('crystal-disabled'); g1StartBtn.classList.remove('hidden');
}

function startGame1() {
    if (!deductLife()) return exitGame();
    haptic('medium'); g1Active = true; g1StartBtn.classList.add('hidden');
    g1Target.classList.remove('crystal-disabled'); g1Inst.innerText = "TAP FAST!!";
    
    g1TimerInterval = setInterval(() => {
        g1TimeLeft -= 0.1; g1TimerText.innerText = g1TimeLeft.toFixed(1) + "s";
        if (g1TimeLeft <= 0) { clearInterval(g1TimerInterval); endGame1(false); }
    }, 100);
}

function tapCrystal() {
    if (!g1Active) return;
    haptic('light'); g1Taps++; g1Progress.style.width = `${(g1Taps / G1_MAX_TAPS) * 100}%`;
    if (g1Taps >= G1_MAX_TAPS) { clearInterval(g1TimerInterval); endGame1(true); }
}

function endGame1(won) {
    g1Active = false; g1Target.classList.add('crystal-disabled');
    if (won) {
        haptic('success'); const reward = Math.floor(Math.random() * 5) + 1; 
        state.gh += reward; g1Inst.innerText = `OVERLOAD! +${reward} GH`; g1Inst.style.color = "var(--accent-cyan)"; 
        fetchGlobalStats(); 
        forceSaveToDB(); 
    } else {
        haptic('error'); g1Inst.innerText = "Failed! Core stabilized."; g1Inst.style.color = "var(--accent-red)";
    }
    setTimeout(() => { g1Inst.style.color = "var(--text-main)"; initGame1(); }, 2500);
}

let g2Active = false, g2Pos = 0, g2Dir = 1, g2Speed = 2.5, g2AnimFrame;
const g2Inst = document.getElementById('g2-instruction'), g2Slider = document.getElementById('g2-slider');
const g2StartBtn = document.getElementById('g2-start-btn'), g2Track = document.getElementById('g2-track-container');

function initGame2() {
    haptic('light'); gameMenu.classList.add('hidden'); game2Area.classList.remove('hidden');
    g2Pos = 0; g2Slider.style.left = "0%"; g2Inst.innerText = "Stop the laser in the green zone!";
    g2StartBtn.classList.remove('hidden'); g2Track.style.pointerEvents = "none";
}

function startGame2() {
    if (!deductLife()) return exitGame();
    haptic('medium'); g2Active = true; g2StartBtn.classList.add('hidden');
    g2Inst.innerText = "TAP TRACK TO STOP!"; g2Track.style.pointerEvents = "auto";
    g2Speed = Math.random() * 1.5 + 2; 
    
    function moveSlider() {
        if (!g2Active) return;
        g2Pos += g2Dir * g2Speed;
        if (g2Pos >= 100) { g2Pos = 100; g2Dir = -1; }
        if (g2Pos <= 0) { g2Pos = 0; g2Dir = 1; }
        g2Slider.style.left = g2Pos + "%"; g2AnimFrame = requestAnimationFrame(moveSlider);
    }
    moveSlider();
}

function stopSlider() {
    if (!g2Active) return;
    g2Active = false; cancelAnimationFrame(g2AnimFrame);
    if (g2Pos >= 40 && g2Pos <= 60) {
        haptic('success'); const reward = Math.floor(Math.random() * 5) + 1;
        state.gh += reward; g2Inst.innerText = `PERFECT! +${reward} GH`; g2Inst.style.color = "var(--accent-green)"; 
        fetchGlobalStats(); 
        forceSaveToDB(); 
    } else {
        haptic('error'); g2Inst.innerText = "Missed the Core!"; g2Inst.style.color = "var(--accent-red)";
    }
    g2Track.style.pointerEvents = "none";
    setTimeout(() => { g2Inst.style.color = "var(--text-main)"; initGame2(); }, 2000);
}

function withdraw() {
    if (globalStats.totalMined < TOTAL_POOL) return appAlert("The Global Pool is not finished yet. Keep mining!");
    if (!state.solAddress) return appAlert("Please save your SOL address first to process withdrawal!");
    if (state.walletCoins <= 0) return appAlert("Your wallet is empty!");
    haptic('success');
    appAlert(`Success! Withdrawal request for ${state.walletCoins.toFixed(2)} Coins to address ${state.solAddress} has been securely submitted!`);
    state.walletCoins = 0; forceSaveToDB(); updateUI();
}

// Start Game
loadGameData();

// ==========================================
// REFERRAL SYSTEM
// ==========================================

async function processReferral(referrerId) {
    try {
        console.log("Processing referral for referrer:", referrerId);
        // 1. Check if already referred
        const { data: existingRef, error: checkErr } = await supabaseClient
            .from('refferal2')
            .select('id')
            .eq('referred_id', tgUser.id)
            .maybeSingle(); // Use maybeSingle to avoid throwing error on 0 rows
            
        if (existingRef) {
            console.log("User already referred.");
            return; // Already referred
        }

        // 2. Insert into refferal2
        const { error: insertErr } = await supabaseClient
            .from('refferal2')
            .insert([{
                referrer_id: referrerId,
                referred_id: tgUser.id,
                reward_coins: 100,
                reward_power: 100
            }]);

        if (insertErr) {
            console.error("Referral insert error (Check RLS policies!):", insertErr);
            return;
        }

        // 3. Reward current user
        state.gh += 100;
        state.walletCoins += 100;
        appAlert("🎉 You were referred! +100 GH/s and +100 Coins!");
        forceSaveToDB();

        // 4. Reward referrer (Client-side approach - ideally this should be an RPC or DB trigger)
        const { data: referrerData } = await supabaseClient
            .from('players')
            .select('gh_power, wallet_coins')
            .eq('telegram_id', referrerId)
            .maybeSingle();
            
        if (referrerData) {
            const { error: updateErr } = await supabaseClient
                .from('players')
                .update({
                    gh_power: (Number(referrerData.gh_power) || 0) + 100,
                    wallet_coins: (Number(referrerData.wallet_coins) || 0) + 100
                })
                .eq('telegram_id', referrerId);
                
            if (updateErr) console.error("Failed to reward referrer (Check RLS!):", updateErr);
        }

    } catch (err) {
        console.error("Referral processing error:", err);
    }
}

async function loadReferralHistory() {
    try {
        const { data, error } = await supabaseClient
            .from('refferal2')
            .select('referred_id, reward_coins, reward_power, created_at')
            .eq('referrer_id', tgUser.id)
            .order('created_at', { ascending: false });

        if (error) throw error;

        const listEl = document.getElementById('referral-history-list');
        if (!listEl) return;

        if (!data || data.length === 0) {
            listEl.innerHTML = '<p style="text-align:center; color:var(--text-muted); font-size:12px;">No frens invited yet. Share your link!</p>';
            return;
        }

        listEl.innerHTML = '';
        data.forEach(ref => {
            listEl.innerHTML += `
                <div class="task-item" style="margin-bottom: 10px;">
                    <div class="task-info">
                        <span class="task-title">User ID: ${ref.referred_id}</span>
                        <span class="task-reward">+${ref.reward_power} GH/s | +${ref.reward_coins} 🪙</span>
                    </div>
                    <div class="task-status" style="color: var(--accent-green);">Joined</div>
                </div>
            `;
        });
    } catch (err) {
        console.error("Failed to load referral history:", err);
    }
}

async function loadLeaderboards() {
    try {
        // 1. Power Leaderboard
        const { data: topMiners, error: minersErr } = await supabaseClient
            .from('players')
            .select('username, first_name, gh_power')
            .order('gh_power', { ascending: false })
            .limit(10);
            
        const powerListEl = document.getElementById('power-leaderboard');
        if (powerListEl) {
            if (topMiners && topMiners.length > 0) {
                powerListEl.innerHTML = '';
                topMiners.forEach((miner, index) => {
                    const name = miner.username !== 'unknown' ? '@' + miner.username : miner.first_name;
                    powerListEl.innerHTML += `
                        <div class="task-item" style="margin-bottom: 10px;">
                            <div class="task-info">
                                <span class="task-title">#${index + 1} ${name}</span>
                            </div>
                            <div class="task-status" style="color: var(--accent-yellow);">${miner.gh_power} GH/s</div>
                        </div>
                    `;
                });
            } else {
                powerListEl.innerHTML = '<p style="text-align:center; color:var(--text-muted); font-size:12px;">No miners found.</p>';
            }
        }

        // 2. Referral Leaderboard
        const { data: allRefs, error: refErr } = await supabaseClient
            .from('refferal2')
            .select('referrer_id');
            
        const refListEl = document.getElementById('referral-leaderboard');
        if (refListEl) {
            if (allRefs && allRefs.length > 0) {
                const refCounts = {};
                allRefs.forEach(ref => {
                    refCounts[ref.referrer_id] = (refCounts[ref.referrer_id] || 0) + 1;
                });
                
                // Sort by count
                const sortedRefs = Object.entries(refCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);
                
                // Fetch names for top referrers
                const topReferrerIds = sortedRefs.map(r => r[0]);
                const { data: topReferrersData } = await supabaseClient
                    .from('players')
                    .select('telegram_id, username, first_name')
                    .in('telegram_id', topReferrerIds);
                    
                const referrerMap = {};
                if (topReferrersData) {
                    topReferrersData.forEach(p => {
                        referrerMap[p.telegram_id] = p.username !== 'unknown' ? '@' + p.username : p.first_name;
                    });
                }
                
                refListEl.innerHTML = '';
                sortedRefs.forEach((ref, index) => {
                    const name = referrerMap[ref[0]] || `User ${ref[0]}`;
                    refListEl.innerHTML += `
                        <div class="task-item" style="margin-bottom: 10px;">
                            <div class="task-info">
                                <span class="task-title">#${index + 1} ${name}</span>
                            </div>
                            <div class="task-status" style="color: var(--accent-cyan);">${ref[1]} Invites</div>
                        </div>
                    `;
                });
            } else {
                refListEl.innerHTML = '<p style="text-align:center; color:var(--text-muted); font-size:12px;">No referrals yet.</p>';
            }
        }
    } catch (err) {
        console.error("Failed to load leaderboards:", err);
    }
}

function updateInviteLink() {
    const inviteInput = document.getElementById('invite-link-input');
    if (inviteInput && tgUser && tgUser.id) {
        inviteInput.value = `https://t.me/miners_hub_bot/hub?startapp=ref_${tgUser.id}`;
    }
}

function copyInviteLink() {
    const inviteInput = document.getElementById('invite-link-input');
    if (!inviteInput) return;
    
    inviteInput.select();
    inviteInput.setSelectionRange(0, 99999); // For mobile devices
    
    navigator.clipboard.writeText(inviteInput.value).then(() => {
        haptic('success');
        appAlert("Invite link copied to clipboard!");
    }).catch(err => {
        console.error('Failed to copy: ', err);
        appAlert("Failed to copy link. Please copy it manually.");
    });
}

function shareInviteLink() {
    const inviteInput = document.getElementById('invite-link-input');
    if (!inviteInput) return;
    
    const shareText = "Join Miner Switch and start mining coins with me! Get a head start with my link!";
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(inviteInput.value)}&text=${encodeURIComponent(shareText)}`;
    
    haptic('medium');
    if (tg && tg.openTelegramLink) {
        tg.openTelegramLink(shareUrl);
    } else {
        window.open(shareUrl, '_blank');
    }
}

// Call this to set the link initially
setTimeout(updateInviteLink, 1000);

