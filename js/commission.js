/**
 * Commission Page JavaScript
 * Full functionality for commission panel
 */

import { PaillierKeyGenerator, PaillierCrypto, shamirSplit, shamirCombine, modInverse } from '/utils/paillier.js';

let currentElection = null;
let currentFinalizationElection = null;

// ===== INITIALIZATION =====
async function init() {
    if (!isLoggedIn() || !isCommission()) {
        alert('⚠️ Dostęp tylko dla członków komisji');
        window.location.href = '/index.html';
        return;
    }

    await loadMyFragments();
    await loadElectionsForFinalization();
}

// ===== LOAD MY KEY FRAGMENTS =====
async function loadMyFragments() {
    try {
        const response = await apiCall('key-shares/my-fragments');
        displayMyFragments(response.fragments || []);
    } catch (error) {
        console.error('Error loading fragments:', error);
    }
}

function displayMyFragments(fragments) {
    const container = document.getElementById('myFragmentsList');
    
    if (fragments.length === 0) {
        container.innerHTML = '<p class="no-data">Brak przypisanych fragmentów kluczy</p>';
        return;
    }
    
    container.innerHTML = fragments.map(frag => `
        <div class="fragment-card">
            <div class="fragment-header">
                <h3>Głosowanie #${frag.election_id}: ${escapeHtml(frag.election_name)}</h3>
                <span class="status-badge">${getStatusLabel(frag.status)}</span>
            </div>
            <div class="fragment-info">
                <p><strong>Indeks fragmentu:</strong> ${frag.share_index}</p>
                <p><strong>Próg:</strong> ${frag.threshold}/${frag.total_shares}</p>
            </div>
            <div class="fragment-value">
                <code>${frag.key_share}</code>
            </div>
            <button class="btn btn-secondary btn-small" onclick="copyFragment('${frag.key_share}')">
                📋 Kopiuj Fragment
            </button>
        </div>
    `).join('');
}

window.copyFragment = async function(value) {
    try {
        await navigator.clipboard.writeText(value);
        alert('✅ Fragment skopiowany do schowka');
    } catch (err) {
        alert('Błąd kopiowania');
    }
};

// ===== CREATE ELECTION =====
window.addCandidate = function() {
    const list = document.getElementById('candidatesList');
    const div = document.createElement('div');
    div.className = 'candidate-input';
    div.innerHTML = `
        <input type="text" placeholder="Nazwa kandydata" class="candidate-name" required>
        <input type="text" placeholder="Opis (opcjonalnie)" class="candidate-desc">
        <button type="button" class="btn-remove" onclick="this.parentElement.remove()">✖</button>
    `;
    list.appendChild(div);
};

document.getElementById('createElectionForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const name = document.getElementById('electionName').value;
    const description = document.getElementById('electionDescription').value;
    const startDate = document.getElementById('startDate').value;
    const endDate = document.getElementById('endDate').value;
    
    // Get candidates
    const candidateInputs = document.querySelectorAll('.candidate-input');
    const candidates = [];
    
    candidateInputs.forEach((input, index) => {
        const nameInput = input.querySelector('.candidate-name');
        const descInput = input.querySelector('.candidate-desc');
        
        if (nameInput && nameInput.value.trim()) {
            candidates.push({
                name: nameInput.value.trim(),
                description: descInput ? descInput.value.trim() : '',
                candidate_index: index
            });
        }
    });
    
    if (candidates.length < 2) {
        alert('Musisz dodać co najmniej 2 kandydatów');
        return;
    }
    
    if (!confirm(`Czy na pewno chcesz utworzyć głosowanie "${name}"?`)) {
        return;
    }
    
    try {
        // Generate Paillier keys
        const keyGen = new PaillierKeyGenerator(512);
        const { publicKey, privateKey } = keyGen.generateKeypair();
        
        // Split private key (5 shares, threshold 3)
        const lambda = privateKey.lambda.toString();
        const mu = privateKey.mu.toString();
        const shares = shamirSplit(lambda, 5, 3);
        
        // Create election
        const response = await apiCall('elections/create', {
            method: 'POST',
            body: JSON.stringify({
                name,
                description,
                startDate: new Date(startDate).toISOString(),
                endDate: new Date(endDate).toISOString(),
                candidates,
                publicKey: {
                    n: publicKey.n.toString(),
                    g: publicKey.g.toString()
                },
                threshold: 3,
                totalShares: 5,
                keyShares: shares.map(share => 
                    `${share.x},${share.y}`
                )
            })
        });
        
        alert('✅ Głosowanie utworzone pomyślnie!');
        document.getElementById('createElectionForm').reset();
        document.getElementById('candidatesList').innerHTML = `
            <div class="candidate-input">
                <input type="text" placeholder="Nazwa kandydata" class="candidate-name" required>
                <input type="text" placeholder="Opis (opcjonalnie)" class="candidate-desc">
            </div>
        `;
        
        await loadMyFragments();
        
    } catch (error) {
        alert('❌ Błąd tworzenia głosowania: ' + error.message);
    }
});

// ===== FINALIZATION & DECRYPTION (COMBINED) =====
let myKeyFragments = {}; // Map: election_id -> fragment

async function loadElectionsForFinalization() {
    try {
        const [electionsResponse, fragmentsResponse] = await Promise.all([
            apiCall('elections/finalizeable'),
            apiCall('key-shares/my-fragments')
        ]);
        
        // Store user's fragments by election_id
        myKeyFragments = {};
        if (fragmentsResponse.fragments) {
            fragmentsResponse.fragments.forEach(frag => {
                if (frag.key_share) {
                    myKeyFragments[frag.election_id] = frag.key_share;
                }
            });
        }
        
        displayElectionsForFinalization(electionsResponse.elections || []);
    } catch (error) {
        console.error('Error loading elections for finalization:', error);
    }
}

function displayElectionsForFinalization(elections) {
    const container = document.getElementById('electionsFinalizationList');
    
    if (elections.length === 0) {
        container.innerHTML = '<p class="no-data">Brak głosowań</p>';
        return;
    }
    
    container.innerHTML = elections.map(election => {
        const hasMyFragment = myKeyFragments[election.id] !== undefined;
        const isActive = election.status === 'active';
        const statusInfo = isActive 
            ? '<span class="status-badge status-active">🟢 Aktywne</span>' 
            : '<span class="status-badge status-closed">🔴 Zakończone</span>';
        
        return `
            <div class="election-card" id="election-${election.id}">
                <h3>${escapeHtml(election.name)} ${statusInfo}</h3>
                <p>${escapeHtml(election.description || '')}</p>
                <p><strong>Oddanych głosów:</strong> ${election.vote_count || 0} | <strong>Fragmenty kluczy:</strong> ${election.shares_count || 0}/5 ${hasMyFragment ? '✅' : '⚠️'}</p>
                ${isActive ? '<p class="warning-text">⚠️ To głosowanie jest aktywne. Zakończenie uniemożliwi dalsze głosowanie.</p>' : ''}
                
                <div class="finalization-modes">
                    <!-- TRYB AUTOMATYCZNY -->
                    <div class="mode-section">
                        <h4>📤 Tryb Automatyczny</h4>
                        <p class="mode-info">Głosy finalizacyjne: <strong>${election.finalization_votes_count || 0}/3</strong></p>
                        <button class="btn btn-primary" onclick="voteForFinalization(${election.id}, ${isActive})">
                            ${isActive ? '📤 Zakończ i zagłosuj' : '📤 Zagłosuj na finalizację'}
                        </button>
                    </div>
                    
                    <!-- TRYB RĘCZNY -->
                    <div class="mode-section">
                        <h4>🔓 Tryb Ręczny</h4>
                        <button class="btn btn-secondary" onclick="toggleManualMode(${election.id})" ${!hasMyFragment ? 'disabled title="Nie posiadasz fragmentu klucza"' : ''}>
                            ${hasMyFragment ? '🔓 Wprowadź fragmenty' : '⚠️ Brak fragmentu'}
                        </button>
                        
                        <div id="manual-mode-${election.id}" class="manual-mode-form" style="display: none;">
                            <p class="info-text">Twój fragment został automatycznie wczytany. Wprowadź 2 dodatkowe fragmenty od innych członków komisji.</p>
                            
                            <div class="key-shares-container">
                                <div class="key-share-input">
                                    <label>Fragment 1 (Twój):</label>
                                    <input type="text" value="${hasMyFragment ? myKeyFragments[election.id] : ''}" readonly class="share-value-readonly">
                                </div>
                                
                                <div class="key-share-input">
                                    <label>Fragment 2 (od innego członka):</label>
                                    <input type="text" placeholder="np. 1,123456..." class="share-value" id="share-2-${election.id}">
                                </div>
                                
                                <div class="key-share-input">
                                    <label>Fragment 3 (od kolejnego członka):</label>
                                    <input type="text" placeholder="np. 2,987654..." class="share-value" id="share-3-${election.id}">
                                </div>
                            </div>
                            
                            <div style="margin-top: 15px; display: flex; gap: 10px;">
                                <button class="btn btn-success" onclick="finalizeWithKeyShares(${election.id}, ${isActive})">
                                    ${isActive ? '🔓 Zakończ i odszyfruj' : '🔓 Odszyfruj wyniki'}
                                </button>
                                <button class="btn btn-secondary" onclick="toggleManualMode(${election.id})">
                                    ❌ Anuluj
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// Tryb automatyczny - głosowanie za finalizacją
window.voteForFinalization = async function(electionId, isActive = false) {
    const confirmMsg = isActive 
        ? 'Czy na pewno chcesz ZAKOŃCZYĆ to głosowanie i zagłosować za finalizacją?\n\n⚠️ Po zamknięciu nikt nie będzie mógł już oddać głosu!\n\nPo osiągnięciu 3/5 głosów komisji, wyniki zostaną automatycznie odszyfrowane.'
        : 'Czy na pewno chcesz zagłosować na finalizację tego głosowania?\n\nPo osiągnięciu 3/5 głosów, wyniki zostaną automatycznie odszyfrowane.';
    
    if (!confirm(confirmMsg)) {
        return;
    }
    
    try {
        const response = await apiCall(`elections/${electionId}/vote-finalize`, {
            method: 'POST'
        });
        
        // If threshold reached, auto-decrypt
        if (response.autoFinalize && response.shares && response.shares.length >= 3) {

            try {
                // Get full election details with candidates
                const allElections = await apiCall('elections');
                const election = [...(allElections.active || []), ...(allElections.closed || [])]
                    .find(e => e.id === electionId);
                
                if (!election) {
                    throw new Error('Election not found');
                }
                
                // Parse candidates if stored as JSON string
                if (typeof election.candidates === 'string') {
                    election.candidates = JSON.parse(election.candidates);
                }
                
                // Convert shares from API format
                const shares = response.shares.slice(0, 3).map(share => ({
                    x: parseInt(share.x),
                    y: BigInt(share.y)
                }));
                
                // Reconstruct private key lambda
                const lambda = shamirCombine(shares);
                const n = BigInt(election.public_key_n);
                
                // Calculate mu = lambda^(-1) mod n (for g = n+1)
                const mu = modInverse(lambda, n);
                
                // Decrypt results - pass lambda and mu to constructor
                const crypto = new PaillierCrypto(
                    n,
                    BigInt(election.public_key_g),
                    lambda,
                    mu
                );
                
                const encryptedResult = BigInt(election.encrypted_result);
                const decryptedSum = crypto.decrypt(encryptedResult);
                const results = decodeVoteSum(decryptedSum, election.candidates.length);
                
                // Save results to database
                await apiCall(`elections/${electionId}/save-results`, {
                    method: 'POST',
                    body: JSON.stringify({ results })
                });
                
                // Display results with auto-finalization message
                const candidates = election.candidates;
                const totalVotes = results.reduce((sum, v) => sum + v, 0);
                const resultsText = candidates.map((c, i) => 
                    `${c.name}: ${results[i]} głosów (${totalVotes > 0 ? ((results[i]/totalVotes)*100).toFixed(2) : '0.00'}%)`
                ).join('\n');
                
                alert(`🎉 Głosowanie automatycznie zakończone i odszyfrowane!

Próg 3/5 głosów został osiągnięty.

Wyniki głosowania "${election.name}":

Łącznie oddanych głosów: ${totalVotes}

${resultsText}`);
                
                // Reload elections list
                await loadElectionsForFinalization();
                
            } catch (decryptError) {
                alert(`✅ Głos oddany - próg osiągnięty (${response.votes}/3)\n\nAutomatyczne deszyfrowanie nie powiodło się. Użyj trybu ręcznego.`);  
            }
        } else {
            alert(`✅ Głos oddany (${response.votes}/3)\n\nPotrzeba jeszcze ${3 - (response.votes || 0)} głosów do automatycznego zakończenia.`);
        }
        
        await loadElectionsForFinalization();
        
    } catch (error) {
        alert('Błąd: ' + error.message);
    }
};

// Toggle manual mode form
window.toggleManualMode = function(electionId) {
    const form = document.getElementById(`manual-mode-${electionId}`);
    if (form.style.display === 'none') {
        form.style.display = 'block';
    } else {
        form.style.display = 'none';
    }
};

// Tryb ręczny - finalizacja z kluczami
window.finalizeWithKeyShares = async function(electionId, isActive = false) {
    const confirmMsg = isActive
        ? 'Czy na pewno chcesz ZAKOŃCZYĆ to głosowanie i odszyfrować wyniki?\n\n⚠️ Po zamknięciu nikt nie będzie mógł już oddać głosu!'
        : 'Czy na pewno chcesz odszyfrować wyniki tego głosowania?';
    
    if (!confirm(confirmMsg)) {
        return;
    }
    
    try {
        // Close election if it's active
        if (isActive) {
            await apiCall(`elections/${electionId}/close`, {
                method: 'POST'
            });
        }
        
        // Get election details
        const allElections = await apiCall('elections');
        const election = [...(allElections.active || []), ...(allElections.closed || [])]
            .find(e => e.id === electionId);
        
        if (!election) {
            alert('❌ Głosowanie nie znalezione');
            return;
        }
        
        // Parse candidates if stored as JSON string
        if (typeof election.candidates === 'string') {
            election.candidates = JSON.parse(election.candidates);
        }
        
        // Collect shares from form
        const shares = [];
        
        // Add user's own fragment
        const myFragment = myKeyFragments[electionId];
        if (myFragment) {
            const [x, y] = myFragment.split(',');
            shares.push({ x: parseInt(x), y: BigInt(y) });
        }
        
        // Add fragment 2
        const share2Input = document.getElementById(`share-2-${electionId}`);
        if (share2Input && share2Input.value.trim()) {
            const [x, y] = share2Input.value.trim().split(',');
            shares.push({ x: parseInt(x), y: BigInt(y) });
        }
        
        // Add fragment 3
        const share3Input = document.getElementById(`share-3-${electionId}`);
        if (share3Input && share3Input.value.trim()) {
            const [x, y] = share3Input.value.trim().split(',');
            shares.push({ x: parseInt(x), y: BigInt(y) });
        }
        
        if (shares.length < 3) {
            alert('❌ Musisz wprowadzić wszystkie 3 fragmenty klucza');
            return;
        }
        
        // Reconstruct private key using Shamir's Secret Sharing
        const lambda = shamirCombine(shares);
        const n = BigInt(election.public_key_n);
        
        // Calculate mu = lambda^(-1) mod n (for g = n+1)
        const mu = modInverse(lambda, n);
        
        // Initialize Paillier crypto
        const crypto = new PaillierCrypto(
            BigInt(election.public_key_n),
            BigInt(election.public_key_g),
            lambda,
            mu
        );
        
        // Decrypt the encrypted result
        const encryptedResult = BigInt(election.encrypted_result);
        const decryptedSum = crypto.decrypt(encryptedResult);
        const results = decodeVoteSum(decryptedSum, election.candidates.length);
        
        // Save results to database
        await apiCall(`elections/${electionId}/save-results`, {
            method: 'POST',
            body: JSON.stringify({ results })
        });
        
        // Display results with finalization message
        displayResults(election, results, true);
        
        // Reload list to update status
        await loadElectionsForFinalization();
        
    } catch (error) {
        alert('❌ Błąd zakończenia głosowania: ' + error.message);
    }
};

function decodeVoteSum(aggregatedSum, numCandidates) {
    const BASE = 1000000000n;
    const results = [];
    let remaining = BigInt(aggregatedSum);
    
    for (let i = 0; i < numCandidates; i++) {
        const divisor = BASE ** BigInt(i);
        const votes = remaining % BASE;
        results.push(Number(votes));
        remaining = remaining / BASE;
    }
    
    return results;
}

function displayResults(election, results, isManualFinalization = false) {
    const candidates = election.candidates;
    const totalVotes = results.reduce((sum, v) => sum + v, 0);
    
    const resultsText = candidates.map((c, i) => 
        `${c.name}: ${results[i]} głosów (${totalVotes > 0 ? ((results[i]/totalVotes)*100).toFixed(2) : '0.00'}%)`
    ).join('\n');
    
    const finalizationMsg = isManualFinalization 
        ? '🔓 Głosowanie zakończone i odszyfrowane (tryb ręczny)!\n\n' 
        : '';
    
    alert(`${finalizationMsg}✅ Wyniki głosowania "${election.name}":\n\nŁącznie oddanych głosów: ${totalVotes}\n\n${resultsText}`);
}

// ===== TAB SWITCHING =====
window.switchCommissionTab = function(tabName) {
    // Remove active class from all tabs
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    
    // Add active class to selected tab
    let btnIndex = 1;
    if (tabName === 'fragments') btnIndex = 1;
    else if (tabName === 'create') btnIndex = 2;
    else if (tabName === 'elections') btnIndex = 3;
    
    const selectedBtn = document.querySelector(`.tab-btn:nth-child(${btnIndex})`);
    const selectedContent = document.getElementById(`tab-${tabName}`);
    
    if (selectedBtn) selectedBtn.classList.add('active');
    if (selectedContent) selectedContent.classList.add('active');
};

// Initialize
init();
