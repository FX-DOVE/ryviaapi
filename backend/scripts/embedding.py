import sys
import json

try:
    from sentence_transformers import SentenceTransformer
except ImportError:
    print(json.dumps({"error": "sentence-transformers not installed"}))
    sys.exit(1)

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No text prompt provided"}))
        sys.exit(1)
        
    text = sys.argv[1]
    
    try:
        # Initialise Sentence Transformer model (cached locally)
        model = SentenceTransformer("all-MiniLM-L6-v2")
        embedding = model.encode(text)
        
        # Output float array as JSON
        print(json.dumps(embedding.tolist()))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    main()
