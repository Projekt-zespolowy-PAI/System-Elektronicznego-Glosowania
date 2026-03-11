/**
 * Home Page JavaScript - Main voting page
 * Combines: Election list, Voting interface, Results display
 */

import { PaillierCrypto } from '/utils/paillier.js';

let paillier = null;
let currentElection = null;

// ===== INITIALIZATION =====
async function init() {
    // Check if user can vote
    const loggedIn = isLoggedIn();
    
    // Load elections
    await loadElections();
    
    // Initialize Paillier crypto
    try {
        paillier = new PaillierCrypto();
    } catch (error) {
        // Paillier init failed — crypto unavailable until election is loaded
    }
}

// ===== LOAD ELECTIONS =====
async function loadElections() {
    try {
        const data = await apiCall('elections');
        displayElections(data.active || [], data.closed || []);
    } catch (error) {
        showError('Błąd ładowania głosowań');
    }
}

// ===== DISPLAY ELECTIONS =====
function displayElections(active, closed) {
    const activeContainer = document.getElementById('activeElections');
    const closedContainer = document.getElementById('closedElections');
    const loggedIn = isLoggedIn();
    
    // Active elections
    if (active.length === 0) {
        activeContainer.innerHTML = '<p class="no-elections">Brak aktywnych głosowań</p>';
    } else {
        activeContainer.innerHTML = active.map(election => `
            <div class="election-card">
                <div class="election-header">
                    <h3>${escapeHtml(election.name)}</h3>
                    <span class="status-badge status-active">${getStatusLabel(election.status)}</span>
                </div>
                <p class="election-description">${escapeHtml(election.description || '')}</p>
                <div class="election-meta">
                    <p>📅 Zakończenie: ${formatDate(election.end_date)}</p>
                </div>
                ${loggedIn 
                    ? `<button class="btn btn-primary" onclick="selectElectionToVote(${election.id})">\ud83d\uddf3\ufe0f Głosuj</button>`
                    : `<p class="login-required">⚠\ufe0f Zaloguj się, aby głosować</p>`
                }
            </div>
        `).join('');
    }
    
    // Closed elections
    if (closed.length === 0) {
        closedContainer.innerHTML = '<p class="no-elections">Brak zakończonych głosowań</p>';
    } else {
        closedContainer.innerHTML = closed.map(election => {
            const hasResults = election.decrypted_result;
            return `
                <div class="election-card">
                    <div class="election-header">
                        <h3>${escapeHtml(election.name)}</h3>
                        <span class="status-badge status-closed">${getStatusLabel(election.status)}</span>
                    </div>
                    <p class="election-description">${escapeHtml(election.description || '')}</p>
                    <div class="election-meta">
                        <p>📅 Zakończono: ${formatDate(election.end_date)}</p>
                    </div>
                    ${hasResults 
                        ? `<button class="btn btn-secondary" onclick="viewResults(${election.id})">📊 Zobacz wyniki</button>`
                        : `<p class="results-pending">⏳ Wyniki niedostępne</p>`
                    }
                </div>
            `;
        }).join('');
    }
}

// ===== SELECT ELECTION TO VOTE =====
window.selectElectionToVote = async function(electionId) {
    try {
        const user = getUserInfo();
        if (!user) {
            alert('⚠️ Musisz być zalogowany');
            return;
        }
        
        // Check if already voted
        const status = await apiCall(`votes/check?election=${electionId}&userHash=${user.user_hash}`);
        if (status.has_voted) {
            alert('✅ Oddałeś już głos w tym głosowaniu');
            return;
        }
        
        // Load election details
        const election = await apiCall(`elections/${electionId}`);
        currentElection = election;
        
        // Show voting form
        displayVotingForm(election);
    } catch (error) {
        alert('Błąd: ' + error.message);
    }
};

// ===== DISPLAY VOTING FORM =====
function displayVotingForm(election) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-content voting-modal">
            <div class="modal-header">
                <h2>🗳️ ${escapeHtml(election.name)}</h2>
                <button class="btn-remove" onclick="closeModal()">&times;</button>
            </div>
            <p class="modal-description">${escapeHtml(election.description || '')}</p>
            
            <form id="voteForm" class="vote-form">
                <div class="candidates-list">
                    ${election.candidates.map(candidate => `
                        <label class="candidate-option">
                            <input type="radio" name="candidate" value="${candidate.candidate_index}" required>
                            <div class="candidate-info">
                                <h3>${escapeHtml(candidate.name)}</h3>
                                ${candidate.description ? `<p>${escapeHtml(candidate.description)}</p>` : ''}
                            </div>
                        </label>
                    `).join('')}
                </div>
                
                <div class="modal-actions">
                    <button type="button" class="btn btn-secondary" onclick="closeModal()">Anuluj</button>
                    <button type="submit" class="btn btn-primary">✅ Oddaj Głos</button>
                </div>
            </form>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Handle form submission
    document.getElementById('voteForm').addEventListener('submit', handleVoteSubmit);
}

// ===== HANDLE VOTE SUBMIT =====
async function handleVoteSubmit(e) {
    e.preventDefault();
    
    const selectedIndex = parseInt(document.querySelector('input[name="candidate"]:checked').value);
    
    if (!confirm('🗳️ Czy na pewno chcesz oddać głos? Tej operacji nie można cofnąć.')) {
        return;
    }
    
    try {
        // Create vote vector
        const voteVector = currentElection.candidates.map((_, i) => i === selectedIndex ? 1 : 0);
        
        // Encode vote using positional encoding
        const encodedVote = encodeVoteVector(voteVector);
        
        // Encrypt using Paillier - create new instance with public key
        const crypto = new PaillierCrypto(
            BigInt(currentElection.public_key_n),
            BigInt(currentElection.public_key_g)
        );
        
        const encryptedVote = crypto.encrypt(encodedVote);
        
        // Submit vote
        await apiCall('votes/cast', {
            method: 'POST',
            body: JSON.stringify({
                electionId: currentElection.id,
                encryptedVote: encryptedVote.toString()
            })
        });
        
        // Close modal immediately
        closeModal();
        
        // Show success message after modal closes
        setTimeout(() => {
            alert('✅ Głos oddany pomyślnie!');
            loadElections(); // Refresh
        }, 100);
        
    } catch (error) {
        alert('❌ Błąd podczas głosowania: ' + error.message);
    }
}

// ===== POSITIONAL ENCODING =====
function encodeVoteVector(voteVector) {
    const BASE = 1000000000n;
    let encoded = 0n;
    for (let i = 0; i < voteVector.length; i++) {
        encoded += BigInt(voteVector[i]) * (BASE ** BigInt(i));
    }
    return encoded;
}

// ===== VIEW RESULTS =====
window.viewResults = async function(electionId) {
    try {
        const data = await apiCall(`results/${electionId}`);
        displayResults(data);
    } catch (error) {
        alert('Błąd ładowania wyników: ' + error.message);
    }
};

function displayResults(data) {
    const totalVotes = data.results.reduce((sum, votes) => sum + votes, 0);
    
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-content results-modal">
            <div class="modal-header">
                <h2>📊 Wyniki: ${escapeHtml(data.election.name)}</h2>
                <button class="btn-remove" onclick="closeModal()">&times;</button>
            </div>
            
            <div class="results-summary">
                <p><strong>Łączna liczba głosów:</strong> ${totalVotes}</p>
                <p><strong>Status:</strong> ${getStatusLabel(data.election.status)}</p>
            </div>
            
            <div class="results-list">
                ${data.candidates.map((candidate, i) => {
                    const votes = data.results[i];
                    const percentage = totalVotes > 0 ? ((votes / totalVotes) * 100).toFixed(2) : 0;
                    return `
                        <div class="result-item">
                            <div class="result-info">
                                <h3>${escapeHtml(candidate.name)}</h3>
                                <p class="result-votes">${votes} głosów (${percentage}%)</p>
                            </div>
                            <div class="result-bar">
                                <div class="result-bar-fill" style="width: ${percentage}%"></div>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
            
            <div class="modal-actions">
                <button class="btn btn-secondary" onclick="closeModal()">Zamknij</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
}

// ===== CLOSE MODAL =====
window.closeModal = function() {
    const modal = document.querySelector('.modal-overlay');
    if (modal) {
        modal.remove();
    }
};

// ===== SHOW ERROR =====
function showError(message) {
    alert(message);
}

// ===== TAB SWITCHING =====
window.switchTab = function(tabName) {
    // Remove active class from all tabs
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    
    // Add active class to selected tab
    const selectedBtn = document.querySelector(`.tab-btn:nth-child(${tabName === 'active' ? '1' : '2'})`);
    const selectedContent = document.getElementById(`tab-${tabName}`);
    
    if (selectedBtn) selectedBtn.classList.add('active');
    if (selectedContent) selectedContent.classList.add('active');
};

// Initialize on load
init();
