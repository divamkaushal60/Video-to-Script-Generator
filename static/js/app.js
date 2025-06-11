// DOM Elements
const videoForm = document.getElementById('videoForm');
const topicForm = document.getElementById('topicForm');
const resultContainer = document.getElementById('result');
const analyzeBtn = document.getElementById('analyzeBtn');
const generateBtn = document.getElementById('generateBtn');

// State management
let isAnalyzing = false;
let isGenerating = false;

// Initialize the app
document.addEventListener('DOMContentLoaded', function() {
    initializeEventListeners();
    addScrollEffects();
});

function initializeEventListeners() {
    // Video form submission
    videoForm.addEventListener('submit', handleVideoAnalysis);
    
    // Topic form submission
    topicForm.addEventListener('submit', handleScriptGeneration);
    
    // Smooth scrolling for navigation links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });
}

async function handleVideoAnalysis(event) {
    event.preventDefault();
    
    if (isAnalyzing) return;
    
    const videoLink = document.getElementById('video_link').value.trim();
    
    if (!videoLink) {
        showError('Please enter a YouTube video link.');
        return;
    }
    
    if (!isValidYouTubeUrl(videoLink)) {
        showError('Please enter a valid YouTube video link.');
        return;
    }
    
    setAnalyzing(true);
    
    try {
        const response = await fetch('/analyze_transcript', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                'video_link': videoLink
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showSuccess('Video transcript analyzed successfully! Now enter your topic below.');
            showTopicForm();
            scrollToElement(topicForm);
        } else {
            showError(data.error || 'Failed to analyze the video transcript.');
        }
    } catch (error) {
        console.error('Error analyzing video:', error);
        showError('Network error. Please check your connection and try again.');
    } finally {
        setAnalyzing(false);
    }
}

async function handleScriptGeneration(event) {
    event.preventDefault();
    
    if (isGenerating) return;
    
    const topic = document.getElementById('topic').value.trim();
    
    if (!topic) {
        showError('Please enter a topic for your script.');
        return;
    }
    
    setGenerating(true);
    
    try {
        const response = await fetch('/generate_script', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                'topic': topic
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showGeneratedScript(data.script);
            scrollToElement(resultContainer);
        } else {
            showError(data.error || 'Failed to generate the script.');
        }
    } catch (error) {
        console.error('Error generating script:', error);
        showError('Network error. Please check your connection and try again.');
    } finally {
        setGenerating(false);
    }
}

function setAnalyzing(analyzing) {
    isAnalyzing = analyzing;
    analyzeBtn.disabled = analyzing;
    
    if (analyzing) {
        analyzeBtn.innerHTML = '<div class="spinner"></div> Analyzing...';
    } else {
        analyzeBtn.innerHTML = 'Analyze Video';
    }
}

function setGenerating(generating) {
    isGenerating = generating;
    generateBtn.disabled = generating;
    
    if (generating) {
        generateBtn.innerHTML = '<div class="spinner"></div> Generating Script...';
    } else {
        generateBtn.innerHTML = 'Generate Script';
    }
}

function showTopicForm() {
    topicForm.classList.remove('hidden');
    topicForm.classList.add('fade-in');
}

function showSuccess(message) {
    resultContainer.innerHTML = `<div class="success">${message}</div>`;
    resultContainer.classList.remove('hidden');
    resultContainer.classList.add('fade-in');
}

function showError(message) {
    resultContainer.innerHTML = `<div class="error">${message}</div>`;
    resultContainer.classList.remove('hidden');
    resultContainer.classList.add('fade-in');
}

function showGeneratedScript(script) {
    resultContainer.innerHTML = `
        <div class="result-container">
            <h3>Generated Video Script</h3>
            <div class="result-content">${escapeHtml(script)}</div>
            <button onclick="copyToClipboard()" class="app-button" style="margin-top: 1rem;">
                Copy Script
            </button>
        </div>
    `;
    resultContainer.classList.remove('hidden');
    resultContainer.classList.add('fade-in');
}

function copyToClipboard() {
    const scriptContent = document.querySelector('.result-content').textContent;
    
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(scriptContent).then(() => {
            showTemporaryMessage('Script copied to clipboard!');
        }).catch(err => {
            console.error('Failed to copy: ', err);
            fallbackCopyTextToClipboard(scriptContent);
        });
    } else {
        fallbackCopyTextToClipboard(scriptContent);
    }
}

function fallbackCopyTextToClipboard(text) {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.top = "0";
    textArea.style.left = "0";
    textArea.style.position = "fixed";
    
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    try {
        document.execCommand('copy');
        showTemporaryMessage('Script copied to clipboard!');
    } catch (err) {
        console.error('Fallback: Oops, unable to copy', err);
        showTemporaryMessage('Failed to copy script. Please select and copy manually.');
    }
    
    document.body.removeChild(textArea);
}

function showTemporaryMessage(message) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'success';
    messageDiv.textContent = message;
    messageDiv.style.position = 'fixed';
    messageDiv.style.top = '20px';
    messageDiv.style.right = '20px';
    messageDiv.style.zIndex = '9999';
    messageDiv.style.maxWidth = '300px';
    
    document.body.appendChild(messageDiv);
    
    setTimeout(() => {
        messageDiv.remove();
    }, 3000);
}

function scrollToElement(element) {
    setTimeout(() => {
        element.scrollIntoView({
            behavior: 'smooth',
            block: 'center'
        });
    }, 100);
}

function isValidYouTubeUrl(url) {
    const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|embed\/|v\/)|youtu\.be\/)[\w-]+/;
    return youtubeRegex.test(url);
}

function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, function(m) { return map[m]; });
}

function addScrollEffects() {
    // Header scroll effect
    const header = document.querySelector('.header');
    let lastScrollTop = 0;
    
    window.addEventListener('scroll', () => {
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        
        if (scrollTop > lastScrollTop && scrollTop > 100) {
            // Scrolling down
            header.style.transform = 'translateY(-100%)';
        } else {
            // Scrolling up
            header.style.transform = 'translateY(0)';
        }
        
        lastScrollTop = scrollTop;
    });
    
    // Intersection Observer for animations
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };
    
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('fade-in');
            }
        });
    }, observerOptions);
    
    // Observe elements for animation
    document.querySelectorAll('.feature-card, .step, .app-container').forEach(el => {
        observer.observe(el);
    });
}

// Reset form function
function resetForms() {
    videoForm.reset();
    topicForm.reset();
    topicForm.classList.add('hidden');
    resultContainer.classList.add('hidden');
    setAnalyzing(false);
    setGenerating(false);
}

// Expose reset function globally
window.resetForms = resetForms;