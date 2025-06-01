from youtube_transcript_api import YouTubeTranscriptApi
import requests
import re
import json

# Helper function to extract transcript from YouTube video
def get_youtube_transcript(video_id):
    try:
        transcript = YouTubeTranscriptApi.get_transcript(video_id)
        full_text = " ".join([entry['text'] for entry in transcript])
        return full_text
    except Exception:
        return None  # Return None if there's an error fetching the transcript

# Function to send data to Groq API for analysis (without displaying the analysis result to the user)
def analyze_with_groq(transcript):
    # Replace 'YOUR_GROQ_API_ENDPOINT' with your actual Groq API endpoint including the scheme (http:// or https://)
    url = "https://api.groq.com/openai/v1/chat/completions"  # Example Groq API endpoint (replace with your actual endpoint)
    
    # Replace 'YOUR_GROQ_API_KEY' with your actual Groq API key
    api_key = "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"  # Insert your Groq API key here
    
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}"  # Add the API key to the Authorization header
    }
    
    # Define a detailed prompt for analyzing the transcript
    analysis_prompt = f"""
    Analyze the following script for its writing style, tone, and structure:
    
    {transcript}
    
    Provide a detailed breakdown of the script's style in JSON format:
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
        "model": "deepseek-r1-distill-llama-70b",  # Replace with the appropriate model ID supported by Groq API
        "messages": [
            {"role": "system", "content": "You are an AI assistant that analyzes text."},
            {"role": "user", "content": analysis_prompt}
        ],
        "max_completion_tokens": 500,  # Adjust as needed
        "temperature": 0.7,  # Adjust as needed
        "top_p": 1.0,  # Adjust as needed
        "n": 1,  # Number of responses to generate
        "stop": None  # Stop sequence, if any
    }

    response = requests.post(url, json=payload, headers=headers)
    if response.status_code == 200:
        return response.json()  # Return the raw JSON response for further use
    else:
        print(f"Groq API Error: {response.status_code} {response.text}")
        return None  # Return None if the request fails

# Function to extract key insights from the analysis result
def extract_key_insights(analysis_result):
    try:
        # Extract the content of the first choice (assuming it contains the analysis)
        choices = analysis_result.get('choices', [])
        if not choices:
            print("No analysis results found.")
            return None
        
        analysis_content = choices[0].get('message', {}).get('content', '')
        
        # Attempt to parse the analysis content as JSON
        try:
            insights = json.loads(analysis_content)  # Safely parse JSON
            return insights
        except json.JSONDecodeError:
            # If JSON parsing fails, attempt to manually extract insights from plain text
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
    # Replace 'YOUR_GROQ_API_ENDPOINT' with your actual Groq API endpoint including the scheme (http:// or https://)
    url = "https://api.groq.com/openai/v1/chat/completions"  # Example Groq API endpoint (replace with your actual endpoint)
    
    # Replace 'YOUR_GROQ_API_KEY' with your actual Groq API key
    api_key = "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"  # Insert your Groq API key here
    
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}"  # Add the API key to the Authorization header
    }
    
    # Create a prompt that uses the key insights to generate a new script
    generation_prompt = f"""
    Generate a video script for the following topic: "{topic}". Use the exact style and structure learned from the previous analysis:
    
    Analysis Result:
    Tone: {key_insights.get("tone", "Unknown")}
    Sentence Length: {key_insights.get("sentence_length", "Unknown")}
    Vocabulary: {key_insights.get("vocabulary", "Unknown")}
    Hooks: {key_insights.get("hooks", [])}
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
    
    New Video Script:
    """
    
    payload = {
        "model": "deepseek-r1-distill-llama-70b",  # Replace with the appropriate model ID supported by Groq API
        "messages": [
            {"role": "system", "content": "You are an AI assistant that generates video scripts."},
            {"role": "user", "content": generation_prompt}
        ],
        "max_completion_tokens": 1000,  # Adjust as needed for longer outputs
        "temperature": 0.7,  # Adjust as needed
        "top_p": 1.0,  # Adjust as needed
        "n": 1,  # Number of responses to generate
        "stop": None  # Stop sequence, if any
    }

    response = requests.post(url, json=payload, headers=headers)
    if response.status_code == 200:
        return response.json().get('choices', [{}])[0].get('message', {}).get('content', '')
    else:
        print(f"Groq API Error: {response.status_code} {response.text}")
        return None  # Return None if the request fails

# Extract video ID from YouTube link
def extract_video_id(video_link):
    regex = r"(?:v=|\/videos\/|embed\/|youtu.be\/|\/v\/|\/e\/|watch\?v=|&v=|\/)([a-zA-Z0-9_-]{11})"
    match = re.search(regex, video_link)
    if match:
        return match.group(1)
    else:
        return None  # Return None if the link is invalid

# Main Workflow
def main():
    # User provides YouTube video link
    video_link = input("Enter YouTube video link: ")
    
    try:
        # Step 1: Extract the transcript
        video_id = extract_video_id(video_link)
        if not video_id:
            print("Invalid YouTube video link. Please provide a valid link.")
            return
        
        transcript = get_youtube_transcript(video_id)
        if not transcript:
            print("Failed to fetch the transcript. Please check the video link and try again.")
            return
        
        # Step 2: Analyze the transcript (hidden from the user)
        analysis_result = analyze_with_groq(transcript)
        if not analysis_result:
            print("Failed to analyze the transcript. Please try again later.")
            return
        
        key_insights = extract_key_insights(analysis_result)
        if not key_insights:
            print("Failed to extract key insights from the analysis. Please try again later.")
            return
        
        # Step 3: Ask the user for the topic they want to create a video script for
        topic = input("\nEnter the topic you want to create a video script for: ")
        
        # Step 4: Generate a new script based on the learned style
        new_script = generate_script(key_insights, topic)
        if new_script:
            print("\nGenerated Video Script:")
            print(new_script)
        else:
            print("Failed to generate the video script. Please try again later.")
        
    except Exception as e:
        print(f"An unexpected error occurred: {e}")

if __name__ == "__main__":
    main()