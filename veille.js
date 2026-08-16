// --- SÉLECTION DES ÉLÉMENTS DU DOM ---
const countryInput = document.getElementById('countryInput');
const nameInput = document.getElementById('nameInput');
const searchBtn = document.getElementById('searchBtn');
const refreshBtn = document.getElementById('refreshBtn');

const universitiesGrid = document.getElementById('universitiesGrid');
const statsBar = document.getElementById('statsBar');
const loading = document.getElementById('loading');
const errorMessage = document.getElementById('errorMessage');
const errorText = document.getElementById('errorText');
const emptyMessage = document.getElementById('emptyMessage');

// URL directe du fichier de données officiel Hipolabs (100% stable, aucun blocage CORS)
const DATA_SOURCE_URL = 'https://raw.githubusercontent.com/Hipo/university-domains-list/master/world_universities_and_domains.json';

// Nombre de résultats affichés par lot (performance + bouton "Voir plus")
const BATCH_SIZE = 60;

// Variable de mise en cache pour éviter de re-télécharger la liste à chaque recherche
let cachedUniversities = null;

// Identifiant du timer de recherche différée (debounce)
let searchDebounceId = null;

// Résultats de la recherche en cours (avant pagination par lot)
let currentResults = [];

// Nombre de résultats déjà affichés à l'écran pour la recherche en cours
let displayedCount = 0;

// --- FONCTION PRINCIPALE (FETCH + ASYNC/AWAIT + TRY...CATCH) ---
async function fetchUniversities(country = '', name = '') {
    // 1. Réinitialisation de l'interface
    resetUI();
    showSkeletons();
    showElement(loading);
    universitiesGrid.setAttribute('aria-busy', 'true');

    try {
        // Récupération des données (depuis le cache ou via fetch)
        if (!cachedUniversities) {
            const response = await fetch(DATA_SOURCE_URL);

            if (!response.ok) {
                throw new Error(`Erreur réseau (Code HTTP : ${response.status})`);
            }

            cachedUniversities = await response.json();
        }

        // 2. Filtrage des données en mémoire
        const countryClean = country.trim().toLowerCase();
        const nameClean = name.trim().toLowerCase();

        const filtered = cachedUniversities.filter(uni => {
            const matchCountry = !countryClean || (uni.country && uni.country.toLowerCase().includes(countryClean));
            const matchName = !nameClean || (uni.name && uni.name.toLowerCase().includes(nameClean));
            return matchCountry && matchName;
        });

        hideElement(loading);
        clearGrid();

        // 3. Traitement des résultats
        currentResults = filtered;

        if (filtered.length === 0) {
            showElement(emptyMessage);
            updateLoadMoreButton();
            universitiesGrid.setAttribute('aria-busy', 'false');
            return;
        }

        // Affichage du premier lot ; le reste se charge via "Voir plus"
        renderNextBatch(true);
        universitiesGrid.setAttribute('aria-busy', 'false');

    } catch (error) {
        console.error("Erreur de chargement :", error);
        hideElement(loading);
        clearGrid();

        errorText.textContent = "Impossible de récupérer la liste des universités. Vérifiez votre connexion.";
        showElement(errorMessage);
        universitiesGrid.setAttribute('aria-busy', 'false');
    }
}

// --- AFFICHAGE PAR LOT : ajoute le lot suivant de résultats à la grille ---
function renderNextBatch(reset = false) {
    if (reset) {
        displayedCount = 0;
        clearGrid();
    }

    const nextChunk = currentResults.slice(displayedCount, displayedCount + BATCH_SIZE);
    appendUniversities(nextChunk, displayedCount);
    displayedCount += nextChunk.length;

    updateStatsBar();
    updateLoadMoreButton();
}

// --- MISE À JOUR DE LA BARRE DE COMPTEUR ---
function updateStatsBar() {
    const total = currentResults.length;
    const plurielTotal = total > 1 ? 's' : '';

    let text = `<span class="stat-number">${total}</span> université${plurielTotal} trouvée${plurielTotal}`;

    if (displayedCount < total) {
        text += ` — <span class="stat-number">${displayedCount}</span> affichée${displayedCount > 1 ? 's' : ''}`;
    }

    statsBar.innerHTML = text;
    showElement(statsBar);
}

// --- CRÉATION / MISE À JOUR DU BOUTON "VOIR PLUS" ---
function updateLoadMoreButton() {
    const remaining = currentResults.length - displayedCount;
    let loadMoreBtn = document.getElementById('loadMoreBtn');

    // Rien à charger en plus : on masque le bouton s'il existe
    if (remaining <= 0) {
        if (loadMoreBtn) hideElement(loadMoreBtn);
        return;
    }

    // Le bouton n'existe pas encore : on le crée une seule fois
    if (!loadMoreBtn) {
        loadMoreBtn = document.createElement('button');
        loadMoreBtn.id = 'loadMoreBtn';
        loadMoreBtn.type = 'button';
        loadMoreBtn.className = 'btn btn-secondary load-more-btn';
        loadMoreBtn.setAttribute('aria-controls', 'universitiesGrid');
        loadMoreBtn.addEventListener('click', () => renderNextBatch(false));
        universitiesGrid.insertAdjacentElement('afterend', loadMoreBtn);
    }

    loadMoreBtn.textContent = `Voir plus — ${remaining} université${remaining > 1 ? 's' : ''} restante${remaining > 1 ? 's' : ''} ↓`;
    showElement(loadMoreBtn);
}

// --- INJECTION DES CARTES DANS LE DOM (ajout, sans remplacer le lot précédent) ---
function appendUniversities(universities, startIndex) {
    // Injection du HTML des cartes, façon fiches de catalogue de bibliothèque
    const html = universities.map((uni, index) => {
        let website = (uni.web_pages && uni.web_pages.length > 0) ? uni.web_pages[0] : '';
        const domain = (uni.domains && uni.domains.length > 0) ? uni.domains[0] : 'non spécifié';
        const countryCode = (uni.alpha_two_code || '').toUpperCase();
        const flag = getFlagEmoji(countryCode);
        const callNumber = String(startIndex + index + 1).padStart(3, '0');
        const initial = uni.name ? uni.name.trim().charAt(0).toUpperCase() : '?';
        const crestUrl = getCrestUrl(domain);

        // Sécurisation HTTP -> HTTPS
        if (website.startsWith('http://')) {
            website = website.replace('http://', 'https://');
        }

        const linkHTML = website
            ? `<a href="${escapeHTML(website)}" target="_blank" rel="noopener noreferrer" class="uni-link">
                   🌐 Visiter le site web →
               </a>`
            : `<span class="uni-link disabled">Site indisponible</span>`;

        const crestHTML = crestUrl
            ? `<span class="uni-crest-fallback">${escapeHTML(initial)}</span>
               <img src="${crestUrl}" alt="" loading="lazy" referrerpolicy="no-referrer"
                    onerror="this.remove()">`
            : `<span class="uni-crest-fallback">${escapeHTML(initial)}</span>`;

        return `
            <article class="uni-card" style="--i:${index}">
                <span class="uni-stamp" aria-hidden="true">${flag} ${escapeHTML(countryCode || '—')}</span>
                <div class="uni-header">
                    <div class="uni-crest" aria-hidden="true">
                        ${crestHTML}
                    </div>
                    <div class="uni-header-text">
                        <h2 class="uni-name">${escapeHTML(uni.name)}</h2>
                        <span class="uni-country">${escapeHTML(uni.country)}</span>
                    </div>
                </div>
                <div class="uni-details">
                    <p><strong>N° fiche</strong> <span class="call-number">${callNumber}</span></p>
                    <p><strong>Domaine</strong> <span class="call-number">${escapeHTML(domain)}</span></p>
                </div>
                ${linkHTML}
            </article>
        `;
    }).join('');

    universitiesGrid.insertAdjacentHTML('beforeend', html);
}

// --- URL DU BLASON/LOGO DE L'UNIVERSITÉ, D'APRÈS SON NOM DE DOMAINE ---
// Utilise le service (non officiel, gratuit, sans clé) de favicons de Google.
// L'image se comporte comme un blason : si elle ne charge pas, la lettre
// de repli (uni-crest-fallback) reste visible en dessous.
function getCrestUrl(domain) {
    if (!domain || domain === 'non spécifié') return null;
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;
}

// --- FICHES FANTÔMES PENDANT LE CHARGEMENT ---
function showSkeletons(count = 6) {
    universitiesGrid.innerHTML = Array.from({ length: count }).map((_, index) => `
        <article class="uni-card skeleton" style="--i:${index}" aria-hidden="true">
            <div class="uni-header" style="margin-top: 4px;">
                <div class="uni-crest skeleton-crest"></div>
                <div class="uni-header-text">
                    <div class="skeleton-line" style="width: 80%; height: 18px; margin-bottom: 12px;"></div>
                    <div class="skeleton-line" style="width: 50%;"></div>
                </div>
            </div>
            <div class="uni-details">
                <div class="skeleton-line" style="width: 55%; margin-bottom: 10px;"></div>
                <div class="skeleton-line" style="width: 65%;"></div>
            </div>
        </article>
    `).join('');
}

function clearGrid() {
    universitiesGrid.innerHTML = '';
}

// --- CONVERSION CODE PAYS -> EMOJI DRAPEAU ---
function getFlagEmoji(countryCode) {
    if (!countryCode || countryCode.length !== 2 || !/^[A-Z]{2}$/.test(countryCode)) {
        return '🏳️';
    }
    return countryCode.replace(/./g, char =>
        String.fromCodePoint(127397 + char.charCodeAt(0))
    );
}

// --- FONCTIONS UTILITAIRES DE L'INTERFACE ---
function resetUI() {
    hideElement(errorMessage);
    hideElement(emptyMessage);
    hideElement(statsBar);

    const loadMoreBtn = document.getElementById('loadMoreBtn');
    if (loadMoreBtn) hideElement(loadMoreBtn);
}

function showElement(el) {
    if (el) el.classList.remove('hidden');
}

function hideElement(el) {
    if (el) el.classList.add('hidden');
}

// Protection contre l'injection XSS
function escapeHTML(str) {
    if (!str) return '';
    return str.toString().replace(/[&<>'"]/g,
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag)
    );
}

// Déclencheur de recherche immédiat
function handleSearch() {
    clearTimeout(searchDebounceId);
    const country = countryInput.value;
    const name = nameInput.value;
    fetchUniversities(country, name);
}

// Déclencheur de recherche différée (pendant la saisie)
function handleSearchDebounced() {
    clearTimeout(searchDebounceId);
    searchDebounceId = setTimeout(handleSearch, 450);
}

// --- ÉVÉNEMENTS (LISTENERS) ---
searchBtn.addEventListener('click', handleSearch);
refreshBtn.addEventListener('click', handleSearch);

countryInput.addEventListener('input', handleSearchDebounced);
nameInput.addEventListener('input', handleSearchDebounced);

countryInput.addEventListener('keyup', (e) => {
    if (e.key === 'Enter') handleSearch();
});

nameInput.addEventListener('keyup', (e) => {
    if (e.key === 'Enter') handleSearch();
});

// Lancement au chargement de la page (Par défaut : Senegal)
window.addEventListener('DOMContentLoaded', () => {
    countryInput.value = 'Senegal';
    handleSearch();
});