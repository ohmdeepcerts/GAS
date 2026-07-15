// Signature Canvas Logic
function setupCanvas(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let isDrawing = false;

    // Adjust for high-DPI displays to keep strokes sharp
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#000088'; // Deep blue ink

    const startPosition = (e) => {
        isDrawing = true;
        draw(e);
    };

    const endPosition = () => {
        isDrawing = false;
        ctx.beginPath();
    };

    const draw = (e) => {
        if (!isDrawing) return;
        
        // Get correct mouse/touch position relative to canvas
        const rect = canvas.getBoundingClientRect();
        let clientX = e.clientX || (e.touches && e.touches[0].clientX);
        let clientY = e.clientY || (e.touches && e.touches[0].clientY);
        
        const x = clientX - rect.left;
        const y = clientY - rect.top;

        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x, y);
    };

    canvas.addEventListener('mousedown', startPosition);
    canvas.addEventListener('mouseup', endPosition);
    canvas.addEventListener('mousemove', draw);
    
    // Touch support
    canvas.addEventListener('touchstart', (e) => { e.preventDefault(); startPosition(e); }, {passive: false});
    canvas.addEventListener('touchend', endPosition);
    canvas.addEventListener('touchmove', (e) => { e.preventDefault(); draw(e); }, {passive: false});
}

function clearCanvas(canvasId) {
    const canvas = document.getElementById(canvasId);
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}

// Logo Upload Logic
document.getElementById('logoUpload').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(event) {
            const imgEl = document.getElementById('company-logo');
            const textEl = document.getElementById('logo-text');
            imgEl.src = event.target.result;
            imgEl.style.display = 'block';
            imgEl.style.maxHeight = '40px'; // Restrict height to fit header
            imgEl.style.maxWidth = '200px';
            textEl.style.display = 'none'; // Hide text when logo is present
            
            // Mirror to page 2 footer
            document.getElementById('p2-footer-company').innerText = ""; // Optionally replace text with img on p2 as well if desired
        }
        reader.readAsDataURL(file);
    }
});

// Save & Load Logic (Local Storage)
function saveCertificate() {
    const data = {};
    const inputs = document.querySelectorAll('input[type="text"], textarea');
    inputs.forEach(input => {
        data[input.id] = input.value;
    });

    // Save signatures
    const canvasIssued = document.getElementById('canvas-issued');
    const canvasReceived = document.getElementById('canvas-received');
    data['canvas-issued'] = canvasIssued.toDataURL();
    data['canvas-received'] = canvasReceived.toDataURL();

    // Save Logo
    const logoImg = document.getElementById('company-logo');
    if (logoImg.src && logoImg.style.display !== 'none') {
        data['company-logo'] = logoImg.src;
    }

    localStorage.setItem('gasCertData', JSON.stringify(data));
    
    const statusMsg = document.getElementById('save-status');
    statusMsg.innerText = "Saved successfully!";
    setTimeout(() => { statusMsg.innerText = ""; }, 3000);
}

function loadCertificate() {
    const savedData = localStorage.getItem('gasCertData');
    if (!savedData) {
        alert("No saved certificate found.");
        return;
    }

    const data = JSON.parse(savedData);
    const inputs = document.querySelectorAll('input[type="text"], textarea');
    
    inputs.forEach(input => {
        if (data[input.id] !== undefined) {
            input.value = data[input.id];
        }
    });

    // Load signatures
    const loadCanvas = (id) => {
        if (data[id]) {
            const canvas = document.getElementById(id);
            const ctx = canvas.getContext('2d');
            const img = new Image();
            img.onload = function() {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0);
            };
            img.src = data[id];
        }
    };
    loadCanvas('canvas-issued');
    loadCanvas('canvas-received');

    // Load Logo
    if (data['company-logo']) {
        const imgEl = document.getElementById('company-logo');
        const textEl = document.getElementById('logo-text');
        imgEl.src = data['company-logo'];
        imgEl.style.display = 'block';
        imgEl.style.maxHeight = '40px';
        imgEl.style.maxWidth = '200px';
        textEl.style.display = 'none';
    }
}

// Initialization
window.onload = function() {
    setupCanvas('canvas-issued');
    setupCanvas('canvas-received');
    
    // Auto-sync company name from Header to Footer
    document.getElementById('logo-text').addEventListener('input', function(e) {
        document.getElementById('p2-footer-company').innerText = e.target.innerText;
    });
};