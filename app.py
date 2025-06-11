from flask import Flask, render_template, request, jsonify, url_for
from youtube_transcript_api import YouTubeTranscriptApi
import requests
import re
import json
import os

app = Flask(__name__)

# Global variable to store key insights temporarily
GLOBAL_INSIGHTS = None

# Helper function to extract transcript from YouTube video
def get_youtube_transcript(video_id):
    try:
        transcript = YouTubeTranscriptApi.get_transcript(video_id)
        full_text = " ".join([entry['text'] for entry in transcript])
        return full_text[:5000]  # Truncate to avoid exceeding token limits
    except Exception:
        return None  # Return None if there's an error fetching the transcript

# Function to send data to Groq API for analysis
def analyze_with_groq(transcript):
    url = "https://api.groq.com/openai/v1/chat/completions"  # Replace with your actual endpoint
    api_key = "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"  # Your Groq API key
    
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}"
    }
    
    analysis_prompt = f"""
    Analyze the following script for its writing style, tone, and structure:
    
    {transcript}
    
    Provide ONLY the following breakdown in JSON format (do not include any additional explanations or reasoning):
    {{
      "tone": "Formal/Casual/Humorous/Serious/etc.",
      "sentence_length": "Short/Medium/Long/Mixed",
      "vocabulary": "Simple/Technical/Sophisticated",
      "hooks": ["List of hooks used, e.g., questions, exclamations"],
      "sentiment": "Positive/Negative/Neutral/Mixed",
      "structure": "Describe the structure (e.g., introduction, body, conclusion)",
      "repetition": "Yes/No, describe any repeated phrases or ideas"
    }}
    """
    
    payload = {
        "model": "deepseek-r1-distill-llama-70b",  # Use your model ID
        "messages": [
            {"role": "system", "content": "You are an AI assistant that analyzes text."},
            {"role": "user", "content": analysis_prompt}
        ],
        "max_completion_tokens": 500,
        "temperature": 0.7,
        "top_p": 1.0,
        "n": 1,
        "stop": None
    }

    response = requests.post(url, json=payload, headers=headers)
    if response.status_code == 200:
        print("API Response:", response.json())  # Log the raw API response
        return response.json()
    else:
        print(f"Groq API Error: {response.status_code} {response.text}")  # Log the error details
        return None

# Function to extract key insights from the analysis result
def extract_key_insights(analysis_result):
    try:
        choices = analysis_result.get('choices', [])
        if not choices:
            return None
        
        analysis_content = choices[0].get('message', {}).get('content', '')
        
        # Remove <think> tags if present
        analysis_content = re.sub(r'<think>.*?</think>', '', analysis_content, flags=re.DOTALL).strip()
        
        try:
            # Parse the JSON response into a dictionary
            insights = json.loads(analysis_content)
            return insights
        except json.JSONDecodeError:
            # If JSON parsing fails, manually extract insights from plain text
            insights = {}
            for line in analysis_content.split("\n"):
                if ":" in line:
                    key, value = line.split(":", 1)
                    insights[key.strip().lower()] = value.strip()
            return insights if insights else None
    except Exception as e:
        print(f"Error extracting insights: {e}")
        return None

# Function to generate a new script using Groq API based on the learned style
def generate_script(key_insights, topic):
    url = "https://api.groq.com/openai/v1/chat/completions"  # Replace with your actual endpoint
    api_key = "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"  # Your Groq API key
    
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}"
    }
    
    generation_prompt = f"""
    Generate a video script for the following topic: "{topic}". Use the exact style and structure learned from the previous analysis:
    
    Analysis Result:
    Tone: {key_insights.get("tone", "Unknown")}
    Sentence Length: {key_insights.get("sentence_length", "Unknown")}
    Vocabulary: {key_insights.get("vocabulary", "Unknown")}
    Hooks: {', '.join(key_insights.get("hooks", []))}
    Sentiment: {key_insights.get("sentiment", "Unknown")}
    Structure: {key_insights.get("structure", "Unknown")}
    Repetition: {key_insights.get("repetition", "Unknown")}
    
    Instructions:
    - Match the tone ({key_insights.get("tone", "Unknown")}).
    - Use sentences of {key_insights.get("sentence_length", "Unknown")} length.
    - Use {key_insights.get("vocabulary", "Unknown")} vocabulary.
    - Include hooks like {', '.join(key_insights.get("hooks", []))}.
    - Maintain a {key_insights.get("sentiment", "Unknown")} sentiment.
    - Follow the structure: {key_insights.get("structure", "Unknown")}.
    - Repeat phrases or ideas for emphasis if repetition was noted.
    - DO NOT include scene descriptions or visual cues. Focus only on generating plain text that matches the original transcript's format.
    
    New Video Script:
    """
    
    payload = {
        "model": "deepseek-r1-distill-llama-70b",  # Use your model ID
        "messages": [
            {"role": "system", "content": "You are an AI assistant that generates video scripts."},
            {"role": "user", "content": generation_prompt}
        ],
        "max_completion_tokens": 1000,
        "temperature": 0.7,
        "top_p": 1.0,
        "n": 1,
        "stop": None
    }

    response = requests.post(url, json=payload, headers=headers)
    if response.status_code == 200:
        return response.json().get('choices', [{}])[0].get('message', {}).get('content', '')
    else:
        print(f"Groq API Error: {response.status_code} {response.text}")
        return None

# Extract video ID from YouTube link
def extract_video_id(video_link):
    regex = r"(?:v=|\/videos\/|embed\/|youtu.be\/|\/v\/|\/e\/|watch\?v=|&v=|\/)([a-zA-Z0-9_-]{11})"
    match = re.search(regex, video_link)
    if match:
        return match.group(1)
    else:
        return None

@app.route('/')
def index():
    return render_template('landing.html')

@app.route('/app')
def app_page():
    return render_template('index.html')

@app.route('/analyze_transcript', methods=['POST'])
def analyze_transcript():
    video_link = request.form['video_link']
    
    video_id = extract_video_id(video_link)
    if not video_id:
        return jsonify({"error": "Invalid YouTube video link."}), 400
    
    transcript = get_youtube_transcript(video_id)
    if not transcript:
        return jsonify({"error": "Failed to fetch the transcript. Please make sure the video has captions available."}), 400
    
    analysis_result = analyze_with_groq(transcript)
    if not analysis_result:
        return jsonify({"error": "Failed to analyze the transcript. Please try again later."}), 500
    
    key_insights = extract_key_insights(analysis_result)
    if not key_insights:
        return jsonify({"error": "Failed to extract key insights from the analysis."}), 500
    
    # Store the insights temporarily
    global GLOBAL_INSIGHTS
    GLOBAL_INSIGHTS = key_insights
    
    return jsonify({"success": True})

@app.route('/generate_script', methods=['POST'])
def generate_script_route():
    topic = request.form['topic']
    
    global GLOBAL_INSIGHTS
    if not GLOBAL_INSIGHTS:
        return jsonify({"error": "Transcript analysis not completed. Please start over."}), 400
    
    new_script = generate_script(GLOBAL_INSIGHTS, topic)
    if not new_script:
        return jsonify({"error": "Failed to generate the video script."}), 500
    
    return jsonify({"script": new_script})

if __name__ == "__main__":
    app.run(debug=True)