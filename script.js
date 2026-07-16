// --- DATABASE INITIALIZATION AND SEED DATA ---
const STORAGE_KEYS = {
    CERTIFICATES: 'gas_cert_records',
    SETTINGS: 'gas_cert_settings',
    AUTOMATION_RULES: 'gas_cert_rules',
    CUSTOMERS: 'gas_cert_customers',
    PROPERTIES: 'gas_cert_properties',
    ENGINEERS: 'gas_cert_engineers'
};

let certificates = JSON.parse(localStorage.getItem(STORAGE_KEYS.CERTIFICATES)) || [];
let customers = JSON.parse(localStorage.getItem(STORAGE_KEYS.CUSTOMERS)) || [];
let properties = JSON.parse(localStorage.getItem(STORAGE_KEYS.PROPERTIES)) || [];
let engineers = JSON.parse(localStorage.getItem(STORAGE_KEYS.ENGINEERS)) || [];
let automationRules = JSON.parse(localStorage.getItem(STORAGE_KEYS.AUTOMATION_RULES)) || [];

// Active Wizard Session State
let currentStep = 1;
let activeDraftApplianceList = [];
let sigCanvas, sigCtx, isDrawing = false;

// BUGFIX: these two used to be re-run every time "New Certificate" was opened,
// which re-registered mousedown/mousemove/touch/input/document listeners on the
// SAME persistent DOM nodes each time, stacking up duplicates over a session.
// They now run exactly once.
let signaturePadInitialized = false;
let autocompleteEnginesInitialized = false;

// BUGFIX: when reprinting a saved certificate, the live signature canvas may be
// blank or hold a different certificate's signature. This override lets the
// print compiler use the certificate's own stored signature instead.
let printSignatureOverride = null;

// Seed data if database is brand new
function seedDemoDatabase() {
    customers = [
        { id: "cust-1", name: "Wentworth Estates", address: "163-165 Ilford Lane\nIlford, Essex", postcode: "IG1 2RR" },
        { id: "cust-2", name: "Mandeep Singh", address: "88 Broadway\nLondon", postcode: "E15 1JH" },
        { id: "cust-3", name: "Mark Jones", address: "42 High Street\nCroydon", postcode: "CR0 1GT" }
    ];
    properties = [
        { id: "prop-1", address: "75 B Friary Road\nLondon", postcode: "SE15 1QS" },
        { id: "prop-2", address: "221 Baker Street\nLondon", postcode: "NW1 6XE" }
    ];
    engineers = [
        { id: "eng-1", name: "M. Khan", license: "567294", regNo: "6053462", licenseExpiry: "2027-03-14" },
        { id: "eng-2", name: "A. Shabeer", license: "594832", regNo: "7048123", licenseExpiry: "2026-11-02" } // Link to corporate identity
    ];
    automationRules = [
        { applianceType: "Boiler", targetField: "flue", value: "RS" },
        { applianceType: "Boiler", targetField: "safety", value: "Pass" },
        { applianceType: "Gas Hob", targetField: "flue", value: "N/A" },
        { applianceType: "Gas Hob", targetField: "pressure", value: "N/A" }
    ];

    localStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(customers));
    localStorage.setItem(STORAGE_KEYS.PROPERTIES, JSON.stringify(properties));
    localStorage.setItem(STORAGE_KEYS.ENGINEERS, JSON.stringify(engineers));
    localStorage.setItem(STORAGE_KEYS.AUTOMATION_RULES, JSON.stringify(automationRules));
    
    updateDashboardMetrics();
    renderAllCertificatesTable();
    initSettingsPanel();
    renderCustomersTable();
    renderPropertiesTable();
    renderEngineersTable();
    renderAppliancesLibrary();
    alert("Database populated successfully!");
}

function clearAllData() {
    if(confirm("Delete entire local database? This cannot be undone.")) {
        localStorage.clear();
        certificates = []; customers = []; properties = []; engineers = []; automationRules = [];
        location.reload();
    }
}

// --- BUSINESS SETTINGS PERSISTENCE ---
// BUGFIX: the Settings panel's company profile fields previously had no save
// logic at all - STORAGE_KEYS.SETTINGS existed but was never used, so any edit
// was lost on refresh and the certificate always fell back to the hardcoded
// HTML defaults.
function saveSettings() {
    const settings = {
        companyName: document.getElementById('cfg-company-name').value,
        companyAddress: document.getElementById('cfg-company-address').value,
        companyPostcode: document.getElementById('cfg-company-postcode').value,
        companyPhone: document.getElementById('cfg-company-phone').value,
        companyEmail: document.getElementById('cfg-company-email').value
    };
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
}

function loadSettings() {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEYS.SETTINGS));
    if (!saved) return;
    if (saved.companyName) document.getElementById('cfg-company-name').value = saved.companyName;
    if (saved.companyAddress) document.getElementById('cfg-company-address').value = saved.companyAddress;
    if (saved.companyPostcode) document.getElementById('cfg-company-postcode').value = saved.companyPostcode;
    if (saved.companyPhone) document.getElementById('cfg-company-phone').value = saved.companyPhone;
    if (saved.companyEmail) document.getElementById('cfg-company-email').value = saved.companyEmail;
}

// --- INTERACTIVE NAVIGATION AND DYNAMIC ROUTING ---
document.querySelectorAll('.menu-item').forEach(item => {
    item.addEventListener('click', function(e) {
        e.preventDefault();
        document.querySelectorAll('.menu-item').forEach(i => i.classList.remove('active'));
        this.classList.add('active');
        
        const targetPanel = this.getAttribute('data-target');
        switchPanel(targetPanel);
    });
});

function switchPanel(panelId) {
    document.querySelectorAll('.content-panel').forEach(p => p.classList.remove('active'));
    document.getElementById(panelId).classList.add('active');
    
    // Set Header Title
    const titleText = document.querySelector(`.menu-item[data-target="${panelId}"]`).innerText;
    document.getElementById('page-title').innerText = titleText;
}

// --- DASHBOARD ANALYTICS CORE ---
function updateDashboardMetrics() {
    document.getElementById('stat-total-certs').innerText = certificates.length;
    document.getElementById('stat-active-certs').innerText = certificates.filter(c => !c.isDraft).length;
    document.getElementById('stat-drafts').innerText = certificates.filter(c => c.isDraft).length;

    // BUGFIX: this stat was never calculated before and permanently showed 0.
    // "Expiring soon" = active certs with a next-due date within 30 days (including overdue).
    const today = new Date();
    const soon = new Date();
    soon.setDate(soon.getDate() + 30);
    const expiringCount = certificates.filter(c => {
        if (c.isDraft || !c.expiryDate) return false;
        const due = new Date(c.expiryDate);
        return due <= soon;
    }).length;
    document.getElementById('stat-expiring').innerText = expiringCount;

    const recentBody = document.getElementById('dashboard-recent-table');
    recentBody.innerHTML = '';
    certificates.slice(0, 5).forEach(cert => {
        recentBody.innerHTML += `
            <tr>
                <td>${cert.serialNo}</td>
                <td>${cert.customerName}</td>
                <td>${(cert.propertyAddress || '').replace(/\n/g, ', ')}</td>
                <td>${cert.expiryDate || 'N/A'}</td>
                <td>
                    <button class="btn btn-secondary btn-sm" onclick="printExistingCert('${cert.id}')">Print</button>
                </td>
            </tr>
        `;
    });
}

// --- AUTOCOMPLETE ENGINE & DATA INJECTION ---
function setupAutocomplete(inputID, dropdownID, database, textFields, onSelectCallback) {
    const input = document.getElementById(inputID);
    const dropdown = document.getElementById(dropdownID);

    input.addEventListener('input', function() {
        const query = this.value.toLowerCase();
        dropdown.innerHTML = '';
        if (!query) return;

        const suggestions = database.filter(item => 
            textFields.some(field => item[field].toLowerCase().includes(query))
        );

        suggestions.forEach(item => {
            const row = document.createElement('div');
            row.className = 'autocomplete-suggestion';
            row.innerText = item[textFields[0]];
            row.addEventListener('click', () => {
                onSelectCallback(item);
                dropdown.innerHTML = '';
                input.value = item[textFields[0]];
            });
            dropdown.appendChild(row);
        });
    });

    document.addEventListener('click', (e) => {
        if (e.target !== input) dropdown.innerHTML = '';
    });
}

// Bind autocomplete to active wizard controls
function initAutocompleteEngines() {
    // BUGFIX: this used to run again every time "New Certificate" was opened,
    // stacking duplicate 'input' and document 'click' listeners. Only bind once.
    if (autocompleteEnginesInitialized) return;
    autocompleteEnginesInitialized = true;

    setupAutocomplete('w-cust-search', 'w-cust-results', customers, ['name'], (selected) => {
        document.getElementById('w-cust-address').value = selected.address;
        document.getElementById('w-cust-postcode').value = selected.postcode;
    });

    setupAutocomplete('w-prop-search', 'w-prop-results', properties, ['address'], (selected) => {
        document.getElementById('w-prop-address').value = selected.address;
        document.getElementById('w-prop-postcode').value = selected.postcode;
    });

    // BUGFIX: this previously overwrote the Certificate Number field with a
    // hardcoded "64678627. " + engineer name, destroying whatever serial number
    // had been typed in. The engineer's name is already written into
    // w-eng-search by setupAutocomplete itself, so no extra field needs touching
    // here. The engineer's license number is looked up by name at print time.
    setupAutocomplete('w-eng-search', 'w-eng-results', engineers, ['name'], (selected) => {});
}

// --- WIZARD DESIGN & ENGINE LOGIC ---
function initNewCertificateForm() {
    currentStep = 1;
    activeDraftApplianceList = [];
    printSignatureOverride = null;

    // BUGFIX: previously only the date and defects grid were reset here, so
    // reopening "New Certificate" after saving one left the customer/property/
    // engineer/appliance fields from the PREVIOUS certificate still filled in,
    // and the appliance table still showed the old rows even though the
    // underlying data array had been cleared.
    resetWizardFormFields();

    document.getElementById('w-cert-date').value = new Date().toISOString().split('T')[0];
    updateWizardStepsView();
    initAutocompleteEngines();

    // BUGFIX: setupWizardSignaturePad() used to run every time, re-registering
    // mouse/touch listeners on the same canvas element each visit. Bind once,
    // just clear the drawing on subsequent visits.
    if (!signaturePadInitialized) {
        signaturePadInitialized = true;
        setupWizardSignaturePad();
    } else {
        clearWizardCanvas();
    }

    renderDefectsGrid();
    renderWizardApplianceTable();
}

function resetWizardFormFields() {
    ['w-cust-search', 'w-cust-address', 'w-cust-postcode',
     'w-prop-search', 'w-prop-address', 'w-prop-postcode',
     'w-eng-search', 'w-cert-no', 'w-next-due-date', 'w-remedial-notes',
     'w-work-carried-out', 'w-received-name'
    ].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    ['w-pipe-visual', 'w-pipe-outcome', 'w-ecv-satisfactory', 'w-tightness-test', 'w-bonding-satisfactory']
        .forEach(id => {
            const el = document.getElementById(id);
            if (el) el.selectedIndex = 0;
        });
}

function updateWizardStepsView() {
    document.querySelectorAll('.step-indicator').forEach(el => {
        const stepNum = parseInt(el.getAttribute('data-step'));
        el.className = 'step-indicator' + (stepNum === currentStep ? ' active' : '');
    });

    document.querySelectorAll('.wizard-step-panel').forEach((el, index) => {
        el.className = 'wizard-step-panel' + (index + 1 === currentStep ? ' active' : '');
    });

    document.getElementById('btn-wizard-prev').style.display = currentStep === 1 ? 'none' : 'block';
    document.getElementById('btn-wizard-next').innerText = currentStep === 6 ? 'Generate & Save' : 'Next Step';
}

function navigateWizard(direction) {
    if (currentStep === 6 && direction === 1) {
        saveCertificateWizardOutput();
        return;
    }
    currentStep += direction;
    updateWizardStepsView();
}

// --- AUTOMATION ENGINE: DYNAMIC ROW GENERATION & AUTOMATION RULES ---
function addBlankApplianceRow() {
    const appliance = {
        location: '', type: '', manufacturer: '', model: '',
        owned: 'Yes', inspected: 'Yes', flueType: '', pressure: '',
        safety: '', ventilation: '', visual: '', flueFlow: '',
        coAnalysis: '', serviced: '', safeToUse: '',
        coAlarmFitted: 'N/A', coAlarmInDate: 'N/A', coAlarmSatisfactory: 'N/A'
    };
    activeDraftApplianceList.push(appliance);
    renderWizardApplianceTable();
}

function addApplianceFromTemplate(templateName) {
    const appliance = {
        location: 'Kitchen',
        type: templateName,
        manufacturer: 'Worcester',
        model: 'Greenstar',
        owned: 'Yes',
        inspected: 'Yes',
        flueType: '', pressure: '', safety: '', ventilation: '', visual: '', flueFlow: '', coAnalysis: '', serviced: 'No', safeToUse: 'Yes',
        coAlarmFitted: 'Yes', coAlarmInDate: 'Yes', coAlarmSatisfactory: 'Yes'
    };

    // Apply Automation rules logic
    applyAutomationRules(appliance);
    activeDraftApplianceList.push(appliance);
    renderWizardApplianceTable();
}

function applyAutomationRules(appliance) {
    automationRules.forEach(rule => {
        if (rule.applianceType.toLowerCase() === appliance.type.toLowerCase()) {
            if (rule.targetField === 'flue') appliance.flueType = rule.value;
            if (rule.targetField === 'pressure') appliance.pressure = rule.value;
            if (rule.targetField === 'safety') appliance.safety = rule.value;
            if (rule.targetField === 'ventilation') appliance.ventilation = rule.value;
        }
    });
}

function renderWizardApplianceTable() {
    const tbody = document.getElementById('wizard-appliance-tbody');
    tbody.innerHTML = '';
    activeDraftApplianceList.forEach((app, idx) => {
        tbody.innerHTML += `
            <tr>
                <td><input type="text" value="${app.location}" onchange="updateAppValue(${idx}, 'location', this.value)"></td>
                <td><input type="text" value="${app.type}" onchange="updateAppValue(${idx}, 'type', this.value)"></td>
                <td><input type="text" value="${app.manufacturer}" onchange="updateAppValue(${idx}, 'manufacturer', this.value)"></td>
                <td><input type="text" value="${app.model}" onchange="updateAppValue(${idx}, 'model', this.value)"></td>
                <td><input type="text" value="${app.owned}" onchange="updateAppValue(${idx}, 'owned', this.value)"></td>
                <td><input type="text" value="${app.inspected}" onchange="updateAppValue(${idx}, 'inspected', this.value)"></td>
                <td><input type="text" value="${app.coAlarmFitted || ''}" onchange="updateAppValue(${idx}, 'coAlarmFitted', this.value)"></td>
                <td><input type="text" value="${app.coAlarmInDate || ''}" onchange="updateAppValue(${idx}, 'coAlarmInDate', this.value)"></td>
                <td><input type="text" value="${app.coAlarmSatisfactory || ''}" onchange="updateAppValue(${idx}, 'coAlarmSatisfactory', this.value)"></td>
                <td><button class="btn btn-danger btn-sm" onclick="removeAppliance(${idx})">Remove</button></td>
            </tr>
        `;
    });
}

function updateAppValue(index, key, value) {
    activeDraftApplianceList[index][key] = value;
}

function removeAppliance(index) {
    activeDraftApplianceList.splice(index, 1);
    renderWizardApplianceTable();
}

// --- SIGNATURE DRAW CANVAS ENGINE ---
function setupWizardSignaturePad() {
    sigCanvas = document.getElementById('wizard-sig-canvas');
    sigCtx = sigCanvas.getContext('2d');
    sigCtx.lineWidth = 2;
    sigCtx.strokeStyle = "#0000FF";

    const getPos = (e) => {
        const r = sigCanvas.getBoundingClientRect();
        return {
            x: (e.clientX || (e.touches && e.touches[0].clientX)) - r.left,
            y: (e.clientY || (e.touches && e.touches[0].clientY)) - r.top
        };
    };

    const draw = (e) => {
        if (!isDrawing) return;
        const pos = getPos(e);
        sigCtx.lineTo(pos.x, pos.y);
        sigCtx.stroke();
    };

    sigCanvas.addEventListener('mousedown', (e) => { isDrawing = true; sigCtx.beginPath(); const p = getPos(e); sigCtx.moveTo(p.x, p.y); });
    sigCanvas.addEventListener('mousemove', draw);
    sigCanvas.addEventListener('mouseup', () => isDrawing = false);
    
    sigCanvas.addEventListener('touchstart', (e) => { isDrawing = true; sigCtx.beginPath(); const p = getPos(e); sigCtx.moveTo(p.x, p.y); });
    sigCanvas.addEventListener('touchmove', draw);
    sigCanvas.addEventListener('touchend', () => isDrawing = false);
}

function clearWizardCanvas() {
    sigCtx.clearRect(0, 0, sigCanvas.width, sigCanvas.height);
}

// --- DEFECT REGISTER ENGINE ---
function renderDefectsGrid() {
    const container = document.getElementById('defects-container');
    container.innerHTML = '';
    for(let i=1; i<=5; i++) {
        container.innerHTML += `
            <div class="defect-row mt-10">
                <span class="def-num">${i}</span>
                <input type="text" id="w-defect-${i}" value="N/A" class="form-control" style="width:70%; display:inline-block; margin-right:10px;">
                <input type="text" id="w-defect-warn-${i}" value="N/A" class="form-control red-text" style="width:20%; display:inline-block;">
            </div>
        `;
    }
}

// --- COMPLIANCE STORAGE SAVER ---
function saveCertificateWizardOutput() {
    const newCert = {
        id: 'cert-' + Date.now(),
        serialNo: document.getElementById('w-cert-no').value,
        date: document.getElementById('w-cert-date').value,
        customerName: document.getElementById('w-cust-search').value,
        customerAddress: document.getElementById('w-cust-address').value,
        customerPostcode: document.getElementById('w-cust-postcode').value,
        propertyAddress: document.getElementById('w-prop-address').value,
        propertyPostcode: document.getElementById('w-prop-postcode').value,
        engineerName: document.getElementById('w-eng-search').value,
        workCarriedOut: document.getElementById('w-work-carried-out').value,
        receivedName: document.getElementById('w-received-name').value,
        appliances: activeDraftApplianceList,
        pipework: {
            visual: document.getElementById('w-pipe-visual').value,
            outcome: document.getElementById('w-pipe-outcome').value,
            ecv: document.getElementById('w-ecv-satisfactory').value,
            tightness: document.getElementById('w-tightness-test').value,
            bonding: document.getElementById('w-bonding-satisfactory').value
        },
        defects: [
            { desc: document.getElementById('w-defect-1').value, warn: document.getElementById('w-defect-warn-1').value },
            { desc: document.getElementById('w-defect-2').value, warn: document.getElementById('w-defect-warn-2').value },
            { desc: document.getElementById('w-defect-3').value, warn: document.getElementById('w-defect-warn-3').value },
            { desc: document.getElementById('w-defect-4').value, warn: document.getElementById('w-defect-warn-4').value },
            { desc: document.getElementById('w-defect-5').value, warn: document.getElementById('w-defect-warn-5').value }
        ],
        remedial: document.getElementById('w-remedial-notes').value,
        expiryDate: document.getElementById('w-next-due-date').value,
        signatureData: sigCanvas.toDataURL(),
        isDraft: false
    };

    certificates.unshift(newCert);
    localStorage.setItem(STORAGE_KEYS.CERTIFICATES, JSON.stringify(certificates));
    
    updateDashboardMetrics();
    renderAllCertificatesTable();
    switchPanel('panel-dashboard');
    alert('Certificate generated successfully!');
}

// --- DATABASE FILTER AND DATA PRESENTATION LAYER ---
function renderAllCertificatesTable() {
    const tbody = document.getElementById('all-certs-tbody');
    tbody.innerHTML = '';
    certificates.forEach(cert => {
        tbody.innerHTML += `
            <tr>
                <td>${cert.serialNo}</td>
                <td>${cert.customerName}</td>
                <td>${(cert.propertyAddress || '').replace(/\n/g, ', ')}</td>
                <td>${cert.date}</td>
                <td>${cert.expiryDate}</td>
                <td>
                    <button class="btn btn-secondary btn-sm" onclick="printExistingCert('${cert.id}')">Print / Generate PDF</button>
                    <button class="btn btn-danger btn-sm" onclick="deleteCert('${cert.id}')">Delete</button>
                </td>
            </tr>
        `;
    });
}

function filterCertTable() {
    const q = document.getElementById('cert-search-query').value.toLowerCase();
    const rows = document.querySelectorAll('#all-certs-tbody tr');
    rows.forEach(row => {
        row.style.display = row.innerText.toLowerCase().includes(q) ? '' : 'none';
    });
}

function deleteCert(id) {
    if(confirm('Delete this record permanently?')) {
        certificates = certificates.filter(c => c.id !== id);
        localStorage.setItem(STORAGE_KEYS.CERTIFICATES, JSON.stringify(certificates));
        renderAllCertificatesTable();
        updateDashboardMetrics();
    }
}

// --- VECTOR PRINT VIEW COMPILER ---
// This generates the two-page printable certificate. Its markup and the
// .cert-* CSS classes in style.css are matched against the official
// Landlord/Homeowner Gas Safety Record template and should be treated as a
// fixed document layout - see project notes before changing structure here.

// BUGFIX: date inputs always store/return ISO format (YYYY-MM-DD), but the
// reference certificate uses UK format (DD/MM/YYYY) everywhere. This was
// printing "2026-07-15" instead of "15/07/2026" on every date on the cert.
function formatDateUK(isoDate) {
    if (!isoDate) return '';
    const parts = isoDate.split('-');
    if (parts.length !== 3) return isoDate;
    const [y, m, d] = parts;
    return `${d}/${m}/${y}`;
}

// --- VECTOR PRINT VIEW COMPILER ---
// This certificate is rendered as an EXACT overlay on your real source PDF.
// cert-bg-page1.png / cert-bg-page2.png are the actual embedded images
// extracted losslessly from your uploaded PDF (PyMuPDF confirmed the PDF
// contains zero text objects, zero fonts, and zero vector paths - each page
// is one flat screenshot image). Every border, label, checkbox, and pixel
// you see is your real file; only the dynamic data regions were erased
// (filled with their exact sampled background color) and are restocked
// here with live form data, positioned at coordinates measured directly
// from that same source image. See MEASUREMENT_NOTES.md for the full
// measurement log and exactly what could/could not be extracted from the
// PDF, and for instructions on re-measuring if the source template ever
// changes.
function compileAndShowPDFPreview() {
    const printTarget = document.getElementById('print-canvas-target');

    const companyName = document.getElementById('cfg-company-name').value || 'M K Heating Ltd';
    const companyAddress = (document.getElementById('cfg-company-address').value || '').replace(/\n/g, '<br>');
    const engineerName = document.getElementById('w-eng-search').value || 'N/A';
    const matchedEngineer = engineers.find(e => e.name === engineerName);
    const gasLicense = matchedEngineer ? matchedEngineer.license : 'N/A';
    const gasRegNo = matchedEngineer ? matchedEngineer.regNo : 'N/A';
    const gasExpiry = matchedEngineer ? (matchedEngineer.licenseExpiry || '') : '';

    const custName = document.getElementById('w-cust-search').value;
    const custAddress = document.getElementById('w-cust-address').value.replace(/\n/g, '<br>');
    const custPostcode = document.getElementById('w-cust-postcode').value;
    const propAddress = document.getElementById('w-prop-address').value.replace(/\n/g, '<br>');
    const propPostcode = document.getElementById('w-prop-postcode').value;
    const workCarriedOut = document.getElementById('w-work-carried-out').value || 'N/A';
    const receivedName = document.getElementById('w-received-name').value || '';

    const defectRows = [1, 2, 3, 4, 5].map(i => ({
        desc: (document.getElementById('w-defect-' + i) || {}).value || 'N/A',
        warn: (document.getElementById('w-defect-warn-' + i) || {}).value || 'N/A'
    }));
    const remedialNotes = document.getElementById('w-remedial-notes').value || 'N/A';
    const signatureSrc = printSignatureOverride || (sigCanvas ? sigCanvas.toDataURL() : '');

    const pipeVals = [
        document.getElementById('w-pipe-visual').value,
        document.getElementById('w-pipe-outcome').value,
        document.getElementById('w-ecv-satisfactory').value,
        document.getElementById('w-tightness-test').value,
        document.getElementById('w-bonding-satisfactory').value
    ];

    // ---- PAGE 1 ----
    const p1 = document.createElement('div');
    p1.className = 'pdf-page cert-page1';
    p1.innerHTML = `
        <!-- Topbar: region 2.4%-6.2% top, 32.5%-97.2% left was fully erased
             on the source image, so both labels and values are rebuilt here. -->
        <div class="cf" style="top:2.4%; left:32.5%; width:64.7%; height:3.8%; display:flex;">
            <div class="cf-topbar-seg" style="position:relative; flex:1;">
                <div class="cf-topbar-label">Date</div>
                <div class="cf-topbar-value">${formatDateUK(document.getElementById('w-cert-date').value)}</div>
            </div>
            <div class="cf-topbar-seg" style="position:relative; flex:1.3;">
                <div class="cf-topbar-label">Gas Safe Register No</div>
                <div class="cf-topbar-value">${gasRegNo}</div>
            </div>
            <div class="cf-topbar-seg" style="position:relative; flex:1.5;">
                <div class="cf-topbar-label">Gas Safe Register Licence Number</div>
                <div class="cf-topbar-value">${gasLicense}</div>
            </div>
            <div class="cf-topbar-seg" style="position:relative; flex:0.8;">
                <div class="cf-topbar-label">Expires</div>
                <div class="cf-topbar-value">${formatDateUK(gasExpiry)}</div>
            </div>
            <div class="cf-topbar-seg" style="position:relative; flex:1.8;">
                <div class="cf-topbar-label">Serial No</div>
                <div class="cf-topbar-value">${document.getElementById('w-cert-no').value}</div>
            </div>
        </div>

        <!-- Details row values (labels/borders are baked into the source image) -->
        <div class="cf cf-md" style="top:19.2%; left:3.6%; width:32.6%; height:8.6%;">
            ${custName}<br>${custAddress}
        </div>
        <div class="cf cf-md" style="top:19.2%; left:37.0%; width:32.6%; height:8.6%;">
            ${propAddress}
        </div>
        <div class="cf cf-md" style="top:19.2%; left:70.5%; width:16%; height:8.6%;">
            ${companyName}<br>${companyAddress}
        </div>
        <div class="cf cf-sm cf-bold" style="top:20.2%; left:86.5%; width:11.5%; height:1.6%;">
            Phone: <span class="cf-bold" style="font-weight:normal;">${document.getElementById('cfg-company-phone').value}</span>
        </div>
        <div class="cf cf-sm cf-bold" style="top:23.4%; left:78.5%; width:19%; height:1.6%;">
            Email: <span style="font-weight:normal;">${document.getElementById('cfg-company-email').value}</span>
        </div>

        <!-- Postcode chips: bordered box to match the original template's chip style -->
        <div class="cf cf-md cf-bold cf-center" style="top:26.3%; left:31.5%; width:5.5%; height:1.6%; border:1px solid #999; box-sizing:border-box;">${custPostcode}</div>
        <div class="cf cf-md cf-bold cf-center" style="top:26.3%; left:65.0%; width:5.5%; height:1.6%; border:1px solid #999; box-sizing:border-box;">${propPostcode}</div>
        <div class="cf cf-md cf-bold cf-center" style="top:26.3%; left:91.5%; width:5%; height:1.6%; border:1px solid #999; box-sizing:border-box;">${document.getElementById('cfg-company-postcode').value}</div>

        <!-- Work carried out -->
        <div class="cf cf-md" style="top:30.5%; left:4.3%; width:64.5%; height:11%;">${workCarriedOut}</div>

        <!-- Defects: number column + labels baked into image, only description
             and warning-notice text erased -->
        ${defectRows.map((d, i) => `
            <div class="cf-defect-row" style="top:${43.2 + i * 3.48}%; left:7.0%; width:32%; height:3.48%;">${d.desc}</div>
            <div class="cf-defect-row cf-red cf-center" style="top:${43.5 + i * 3.42}%; left:39.9%; width:8%; height:3.42%; justify-content:center;">${d.warn}</div>
        `).join('')}

        <!-- Pipework: 5 equal value cells -->
        ${pipeVals.map((v, i) => `
            <div class="cf-pipe-cell" style="left:${50.0 + i * 9.3}%; width:9.3%;">${v}</div>
        `).join('')}

        <!-- Remedial notes -->
        <div class="cf cf-md" style="top:63.0%; left:3.6%; width:45.3%; height:21.6%;">${remedialNotes}</div>

        <!-- Sign-off -->
        <img class="cf-sig-img" style="top:67.0%; left:49.9%; width:18.1%; height:4.0%;" src="${signatureSrc}">
        <div class="cf cf-md cf-bold cf-center" style="top:67.0%; left:68.5%; width:15.7%; height:4.0%;">${engineerName.toUpperCase()}</div>
        <div class="cf cf-md cf-bold cf-center" style="top:75.2%; left:68.5%; width:15.7%; height:4.0%;">${receivedName.toUpperCase()}</div>

        <!-- Attention due date -->
        <div class="cf cf-lg cf-red cf-center" style="top:78.5%; left:85.5%; width:10.7%; height:4.5%; display:flex; align-items:center; justify-content:center;">
            ${formatDateUK(document.getElementById('w-next-due-date').value)}
        </div>
    `;

    // ---- PAGE 2 ----
    const p2 = document.createElement('div');
    p2.className = 'pdf-page cert-page2';

    const minSlots = 5;
    const slots = activeDraftApplianceList.slice();
    while (slots.length < minSlots) slots.push(null);

    const applianceRowsHtml = slots.map((app, index) => {
        if (!app) {
            return `
                <tr><td colspan="16">&nbsp;</td></tr>
                <tr class="cert-coalarm-row"><td colspan="16">
                    <div class="cert-coalarm-block">
                        <div class="cert-coalarm-item"><div class="cert-coalarm-label">Approved CO alarm fitted?</div><div class="cert-coalarm-value">&nbsp;</div></div>
                        <div class="cert-coalarm-item"><div class="cert-coalarm-label">Is CO alarm In Date?</div><div class="cert-coalarm-value">&nbsp;</div></div>
                        <div class="cert-coalarm-item"><div class="cert-coalarm-label">CO alarm test satisfactory?</div><div class="cert-coalarm-value">&nbsp;</div></div>
                    </div>
                </td></tr>`;
        }
        return `
            <tr>
                <td>${index + 1}</td>
                <td>${app.location}</td>
                <td>${app.type}</td>
                <td>${app.manufacturer}</td>
                <td>${app.model}</td>
                <td>${app.owned}</td>
                <td>${app.inspected}</td>
                <td>${app.flueType || 'RS'}</td>
                <td>${app.pressure || '20 Mbar'}</td>
                <td>${app.safety || 'Pass'}</td>
                <td>${app.ventilation || 'Pass'}</td>
                <td>${app.visual || 'Pass'}</td>
                <td>${app.flueFlow || 'Pass'}</td>
                <td>${app.coAnalysis || '.0009'}</td>
                <td>${app.serviced || 'No'}</td>
                <td>${app.safeToUse || 'Yes'}</td>
            </tr>
            <tr class="cert-coalarm-row"><td colspan="16">
                <div class="cert-coalarm-block">
                    <div class="cert-coalarm-item"><div class="cert-coalarm-label">Approved CO alarm fitted?</div><div class="cert-coalarm-value">${app.coAlarmFitted || 'N/A'}</div></div>
                    <div class="cert-coalarm-item"><div class="cert-coalarm-label">Is CO alarm In Date?</div><div class="cert-coalarm-value">${app.coAlarmInDate || 'N/A'}</div></div>
                    <div class="cert-coalarm-item"><div class="cert-coalarm-label">CO alarm test satisfactory?</div><div class="cert-coalarm-value">${app.coAlarmSatisfactory || 'N/A'}</div></div>
                </div>
            </td></tr>`;
    }).join('');

    p2.innerHTML = `
        <div class="cf cf-md" style="top:1.4%; left:12.5%; width:27.5%; height:1.4%;">${document.getElementById('w-cert-no').value}</div>
        <div class="cf" style="top:16.3%; left:1.9%; width:95.3%; height:52.7%;">
            <table class="cert-appliance-table">
                <colgroup>
                    <col style="width:3.81%"><col style="width:11.34%"><col style="width:11.58%">
                    <col style="width:12.19%"><col style="width:9.2%"><col style="width:4.46%">
                    <col style="width:4.41%"><col style="width:4.61%"><col style="width:4.59%">
                    <col style="width:4.42%"><col style="width:4.07%"><col style="width:4.37%">
                    <col style="width:4.18%"><col style="width:4.17%"><col style="width:3.89%"><col style="width:3.78%">
                </colgroup>
                <tbody>${applianceRowsHtml}</tbody>
            </table>
        </div>
        <div class="cf cf-md cf-bold" style="top:92%; left:1.9%; width:30%; height:3%;">${companyName}</div>
    `;

    printTarget.innerHTML = '';
    printTarget.appendChild(p1);
    printTarget.appendChild(p2);

    window.print();
}

function printExistingCert(id) {
    const cert = certificates.find(c => c.id === id);
    if (!cert) return;

    // Load selected record properties back to active arrays for printing compile
    activeDraftApplianceList = cert.appliances;
    document.getElementById('w-cert-no').value = cert.serialNo;
    document.getElementById('w-cert-date').value = cert.date;
    document.getElementById('w-cust-search').value = cert.customerName;
    document.getElementById('w-cust-address').value = cert.customerAddress;
    document.getElementById('w-cust-postcode').value = cert.customerPostcode || '';
    document.getElementById('w-prop-address').value = cert.propertyAddress;
    document.getElementById('w-prop-postcode').value = cert.propertyPostcode || '';
    document.getElementById('w-next-due-date').value = cert.expiryDate;
    document.getElementById('w-pipe-visual').value = cert.pipework.visual;
    document.getElementById('w-pipe-outcome').value = cert.pipework.outcome;
    document.getElementById('w-ecv-satisfactory').value = cert.pipework.ecv;
    document.getElementById('w-tightness-test').value = cert.pipework.tightness;
    document.getElementById('w-bonding-satisfactory').value = cert.pipework.bonding;

    // BUGFIX: engineer name, defects, and remedial notes were saved on the
    // certificate but never restored here, so reprints always showed blank/N-A
    // defects even if the original certificate recorded real ones.
    document.getElementById('w-eng-search').value = cert.engineerName || '';
    document.getElementById('w-remedial-notes').value = cert.remedial || '';
    document.getElementById('w-work-carried-out').value = cert.workCarriedOut || '';
    document.getElementById('w-received-name').value = cert.receivedName || '';
    renderDefectsGrid();
    (cert.defects || []).forEach((d, i) => {
        const descEl = document.getElementById('w-defect-' + (i + 1));
        const warnEl = document.getElementById('w-defect-warn-' + (i + 1));
        if (descEl) descEl.value = d.desc;
        if (warnEl) warnEl.value = d.warn;
    });

    // BUGFIX: printing used to grab whatever was currently drawn on the live
    // signature canvas, which may be blank or belong to a different certificate.
    // Use this certificate's own stored signature instead.
    printSignatureOverride = cert.signatureData || null;

    compileAndShowPDFPreview();
}

// --- SETTINGS PANEL & DYNAMIC RULES ENGINE VIEW ---
function initSettingsPanel() {
    const container = document.getElementById('rules-container');
    container.innerHTML = '';
    automationRules.forEach((rule, idx) => {
        container.innerHTML += `
            <div class="automation-rule-row">
                <input type="text" value="${rule.applianceType}" placeholder="IF Appliance is..." onchange="updateRule(${idx}, 'applianceType', this.value)">
                <input type="text" value="${rule.targetField}" placeholder="THEN field is..." onchange="updateRule(${idx}, 'targetField', this.value)">
                <input type="text" value="${rule.value}" placeholder="Populate value..." onchange="updateRule(${idx}, 'value', this.value)">
                <button class="btn btn-danger btn-sm" onclick="removeRule(${idx})">🗑️</button>
            </div>
        `;
    });
}

function updateRule(idx, key, val) {
    automationRules[idx][key] = val;
    localStorage.setItem(STORAGE_KEYS.AUTOMATION_RULES, JSON.stringify(automationRules));
}

function addNewAutomationRuleRow() {
    automationRules.push({ applianceType: '', targetField: '', value: '' });
    initSettingsPanel();
}

function removeRule(idx) {
    automationRules.splice(idx, 1);
    localStorage.setItem(STORAGE_KEYS.AUTOMATION_RULES, JSON.stringify(automationRules));
    initSettingsPanel();
}

// --- CSV EXPORT ---
// BUGFIX: this was called by the "Export CSV Database" button but never defined
// anywhere in the original file, so clicking it threw a ReferenceError.
function exportCertificatesCSV() {
    if (certificates.length === 0) {
        alert('No certificates to export yet.');
        return;
    }
    const headers = ['Certificate Number', 'Customer', 'Installation Address', 'Issue Date', 'Next Due Date', 'Engineer'];
    const csvEscape = (val) => `"${String(val == null ? '' : val).replace(/"/g, '""').replace(/\n/g, ' ')}"`;
    const rows = certificates.map(c => [
        c.serialNo, c.customerName, c.propertyAddress, c.date, c.expiryDate, c.engineerName
    ].map(csvEscape).join(','));
    const csvContent = [headers.map(csvEscape).join(','), ...rows].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'gascert_certificates_' + new Date().toISOString().split('T')[0] + '.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

// --- CUSTOMERS PANEL ---
// BUGFIX: the "Customers" nav item pointed at a panel that didn't exist in the
// HTML at all, so clicking it threw an error and blanked the screen. There was
// also no way to add a customer except via the demo seed data.
function renderCustomersTable() {
    const tbody = document.getElementById('customers-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    customers.forEach((cust, idx) => {
        tbody.innerHTML += `
            <tr>
                <td>${cust.name}</td>
                <td>${(cust.address || '').replace(/\n/g, ', ')}</td>
                <td>${cust.postcode || ''}</td>
                <td><button class="btn btn-danger btn-sm" onclick="deleteCustomer(${idx})">Delete</button></td>
            </tr>
        `;
    });
}

function addCustomer() {
    const name = document.getElementById('new-cust-name').value.trim();
    const address = document.getElementById('new-cust-address').value.trim();
    const postcode = document.getElementById('new-cust-postcode').value.trim();
    if (!name || !address) {
        alert('Please enter at least a name and address.');
        return;
    }
    customers.push({ id: 'cust-' + Date.now(), name, address, postcode });
    localStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(customers));
    document.getElementById('new-cust-name').value = '';
    document.getElementById('new-cust-address').value = '';
    document.getElementById('new-cust-postcode').value = '';
    renderCustomersTable();
}

function deleteCustomer(idx) {
    if (!confirm('Delete this customer record?')) return;
    customers.splice(idx, 1);
    localStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(customers));
    renderCustomersTable();
}

// --- PROPERTIES PANEL ---
// BUGFIX: same issue as Customers - the panel didn't exist and there was no
// add UI.
function renderPropertiesTable() {
    const tbody = document.getElementById('properties-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    properties.forEach((prop, idx) => {
        tbody.innerHTML += `
            <tr>
                <td>${(prop.address || '').replace(/\n/g, ', ')}</td>
                <td>${prop.postcode || ''}</td>
                <td><button class="btn btn-danger btn-sm" onclick="deleteProperty(${idx})">Delete</button></td>
            </tr>
        `;
    });
}

function addProperty() {
    const address = document.getElementById('new-prop-address').value.trim();
    const postcode = document.getElementById('new-prop-postcode').value.trim();
    if (!address) {
        alert('Please enter an address.');
        return;
    }
    properties.push({ id: 'prop-' + Date.now(), address, postcode });
    localStorage.setItem(STORAGE_KEYS.PROPERTIES, JSON.stringify(properties));
    document.getElementById('new-prop-address').value = '';
    document.getElementById('new-prop-postcode').value = '';
    renderPropertiesTable();
}

function deleteProperty(idx) {
    if (!confirm('Delete this property record?')) return;
    properties.splice(idx, 1);
    localStorage.setItem(STORAGE_KEYS.PROPERTIES, JSON.stringify(properties));
    renderPropertiesTable();
}

// --- ENGINEERS PANEL ---
// BUGFIX: same issue as Customers/Properties - the panel didn't exist and
// there was no add UI, even though the engineer license is now used to
// populate the printed certificate's Gas Safe License number.
function renderEngineersTable() {
    const tbody = document.getElementById('engineers-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    engineers.forEach((eng, idx) => {
        tbody.innerHTML += `
            <tr>
                <td>${eng.name}</td>
                <td>${eng.license || ''}</td>
                <td>${eng.regNo || ''}</td>
                <td>${eng.licenseExpiry || ''}</td>
                <td><button class="btn btn-danger btn-sm" onclick="deleteEngineer(${idx})">Delete</button></td>
            </tr>
        `;
    });
}

function addEngineer() {
    const name = document.getElementById('new-eng-name').value.trim();
    const license = document.getElementById('new-eng-license').value.trim();
    const regNo = document.getElementById('new-eng-regno').value.trim();
    const licenseExpiry = document.getElementById('new-eng-expiry').value;
    if (!name || !license) {
        alert('Please enter at least a name and license number.');
        return;
    }
    engineers.push({ id: 'eng-' + Date.now(), name, license, regNo, licenseExpiry });
    localStorage.setItem(STORAGE_KEYS.ENGINEERS, JSON.stringify(engineers));
    document.getElementById('new-eng-name').value = '';
    document.getElementById('new-eng-license').value = '';
    document.getElementById('new-eng-regno').value = '';
    document.getElementById('new-eng-expiry').value = '';
    renderEngineersTable();
}

function deleteEngineer(idx) {
    if (!confirm('Delete this engineer record?')) return;
    engineers.splice(idx, 1);
    localStorage.setItem(STORAGE_KEYS.ENGINEERS, JSON.stringify(engineers));
    renderEngineersTable();
}

// --- APPLIANCES LIBRARY PANEL ---
// BUGFIX: same dead-nav-link issue as the three panels above. This one is
// read-only and auto-compiled from every appliance ever saved on a certificate,
// so it needs no separate data model or add UI of its own.
function renderAppliancesLibrary() {
    const tbody = document.getElementById('appliances-library-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const counts = {};
    certificates.forEach(cert => {
        (cert.appliances || []).forEach(app => {
            const key = `${app.type}|${app.manufacturer}|${app.model}`;
            counts[key] = (counts[key] || 0) + 1;
        });
    });

    const keys = Object.keys(counts);
    if (keys.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4">No appliances recorded on any certificate yet.</td></tr>';
        return;
    }

    keys.sort((a, b) => counts[b] - counts[a]).forEach(key => {
        const [type, manufacturer, model] = key.split('|');
        tbody.innerHTML += `
            <tr>
                <td>${type || 'N/A'}</td>
                <td>${manufacturer || 'N/A'}</td>
                <td>${model || 'N/A'}</td>
                <td>${counts[key]}</td>
            </tr>
        `;
    });
}

// --- INITIAL SYSTEM BOOTSTRAPPER ---
window.onload = function() {
    loadSettings();
    updateDashboardMetrics();
    renderAllCertificatesTable();
    initSettingsPanel();
    renderCustomersTable();
    renderPropertiesTable();
    renderEngineersTable();
    renderAppliancesLibrary();
};