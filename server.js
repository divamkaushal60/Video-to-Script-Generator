const express = require('express');
const axios = require('axios');
const { YoutubeTranscript } = require('youtube-transcript');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Global variable to store key insights temporarily
let GLOBAL_INSIGHTS = null;

// Middleware
app.use(express.static('static'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.set('view engine', 'html');
app.engine('html', require('fs').readFileSync);

// Helper function to extract transcript from YouTube video
async function getYoutubeTranscript(videoId) {
    try {
        const transcript = await YoutubeTranscript.fetchTranscript(videoId);
        const fullText = transcript.map(entry => entry.text).join(' ');
        return fullText.substring(0, 5000); // Truncate to avoid exceeding token limits
    } catch (error) {
        console.error('Error fetching transcript:', error);
        return null;
    }
}

// Function to send data to Groq API for analysis
async function analyzeWithGroq(transcript) {
    const url = "https://api.groq.com/openai/v1/chat/completions";
    const apiKey = "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";
    
    const headers = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
    };
    
    const analysisPrompt = `
    Analyze the following script for its writing style, tone, and structure:
    
    ${transcript}
    
    Provide ONLY the following breakdown in JSON format (do not include any additional explanations or reasoning):
    {
      "tone": "Formal/Casual/Humorous/Serious/etc.",
      "sentence_length": "Short/Medium/Long/Mixed",
      "vocabulary": "Simple/Technical/Sophisticated",
      "hooks": ["List of hooks used, e.g., questions, exclamations"],
      "sentiment": "Positive/Negative/Neutral/Mixed",
      "structure": "Describe the structure (e.g., introduction, body, conclusion)",
      "repetition": "Yes/No, describe any repeated phrases or ideas"
    }
    `;
    
    const payload = {
        "model": "deepseek-r1-distill-llama-70b",
        "messages": [
            {"role": "system", "content": "You are an AI assistant that analyzes text."},
            {"role": "user", "content": analysisPrompt}
        ],
        "max_completion_tokens": 500,
        "temperature": 0.7,
        "top_p": 1.0,
        "n": 1,
        "stop": null
    };

    try {
        const response = await axios.post(url, payload, { headers });
        console.log("API Response:", response.data);
        return response.data;
    } catch (error) {
        console.error(`Groq API Error: ${error.response?.status} ${error.response?.data}`);
        return null;
    }
}

// Function to extract key insights from the analysis result
function extractKeyInsights(analysisResult) {
    try {
        const choices = analysisResult.choices || [];
        if (!choices.length) {
            return null;
        }
        
        let analysisContent = choices[0].message?.content || '';
        
        // Remove <think> tags if present
        analysisContent = analysisContent.replace(/<think>.*?<\/think>/gs, '').trim();
        
        try {
            // Parse the JSON response into a dictionary
            const insights = JSON.parse(analysisContent);
            return insights;
        } catch (jsonError) {
            // If JSON parsing fails, manually extract insights from plain text
            const insights = {};
            analysisContent.split('\n').forEach(line => {
                if (line.includes(':')) {
                    const [key, value] = line.split(':', 2);
                    insights[key.trim().toLowerCase()] = value.trim();
                }
            });
            return Object.keys(insights).length ? insights : null;
        }
    } catch (error) {
        console.error(`Error extracting insights: ${error}`);
        return null;
    }
}

// Function to generate a new script using Groq API based on the learned style
async function generateScript(keyInsights, topic) {
    const url = "https://api.groq.com/openai/v1/chat/completions";
    const apiKey = "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";
    
    const headers = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
    };
    
    const generationPrompt = `
    Generate a video script for the following topic: "${topic}". Use the exact style and structure learned from the previous analysis:
    
    Analysis Result:
    Tone: ${keyInsights.tone || "Unknown"}
    Sentence Length: ${keyInsights.sentence_length || "Unknown"}
    Vocabulary: ${keyInsights.vocabulary || "Unknown"}
    Hooks: ${Array.isArray(keyInsights.hooks) ? keyInsights.hooks.join(', ') : keyInsights.hooks || "Unknown"}
    Sentiment: ${keyInsights.sentiment || "Unknown"}
    Structure: ${keyInsights.structure || "Unknown"}
    Repetition: ${keyInsights.repetition || "Unknown"}
    
    Instructions:
    - Match the tone (${keyInsights.tone || "Unknown"}).
    - Use sentences of ${keyInsights.sentence_length || "Unknown"} length.
    - Use ${keyInsights.vocabulary || "Unknown"} vocabulary.
    - Include hooks like ${Array.isArray(keyInsights.hooks) ? keyInsights.hooks.join(', ') : keyInsights.hooks || "Unknown"}.
    - Maintain a ${keyInsights.sentiment || "Unknown"} sentiment.
    - Follow the structure: ${keyInsights.structure || "Unknown"}.
    - Repeat phrases or ideas for emphasis if repetition was noted.
    - DO NOT include scene descriptions or visual cues. Focus only on generating plain text that matches the original transcript's format.
    
    New Video Script:
    `;
    
    const payload = {
        "model": "deepseek-r1-distill-llama-70b",
        "messages": [
            {"role": "system", "content": "You are an AI assistant that generates video scripts."},
            {"role": "user", "content": generationPrompt}
        ],
        "max_completion_tokens": 1000,
        "temperature": 0.7,
        "top_p": 1.0,
        "n": 1,
        "stop": null
    };

    try {
        const response = await axios.post(url, payload, { headers });
        return response.data.choices?.[0]?.message?.content || '';
    } catch (error) {
        console.error(`Groq API Error: ${error.response?.status} ${error.response?.data}`);
        return null;
    }
}

// Extract video ID from YouTube link
function extractVideoId(videoLink) {
    const regex = /(?:v=|\/videos\/|embed\/|youtu.be\/|\/v\/|\/e\/|watch\?v=|&v=|\/)([a-zA-Z0-9_-]{11})/;
    const match = videoLink.match(regex);
    return match ? match[1] : null;
}

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'templates', 'landing.html'));
});

app.get('/app', (req, res) => {
    res.sendFile(path.join(__dirname, 'templates', 'index.html'));
});

app.post('/analyze_transcript', async (req, res) => {
    const videoLink = req.body.video_link;
    
    const videoId = extractVideoId(videoLink);
    if (!videoId) {
        return res.status(400).json({ error: "Invalid YouTube video link." });
    }
    
    const transcript = await getYoutubeTranscript(videoId);
    if (!transcript) {
        return res.status(400).json({ error: "Failed to fetch the transcript. Please make sure the video has captions available." });
    }
    
    const analysisResult = await analyzeWithGroq(transcript);
    if (!analysisResult) {
        return res.status(500).json({ error: "Failed to analyze the transcript. Please try again later." });
    }
    
    const keyInsights = extractKeyInsights(analysisResult);
    if (!keyInsights) {
        return res.status(500).json({ error: "Failed to extract key insights from the analysis." });
    }
    
    // Store the insights temporarily
    GLOBAL_INSIGHTS = keyInsights;
    
    res.json({ success: true });
});

app.post('/generate_script', async (req, res) => {
    const topic = req.body.topic;
    
    if (!GLOBAL_INSIGHTS) {
        return res.status(400).json({ error: "Transcript analysis not completed. Please start over." });
    }
    
    const newScript = await generateScript(GLOBAL_INSIGHTS, topic);
    if (!newScript) {
        return res.status(500).json({ error: "Failed to generate the video script." });
    }
    
    res.json({ script: newScript });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});