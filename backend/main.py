import os
import shutil
from fastapi import FastAPI, UploadFile, File, HTTPException
from pydantic import BaseModel
from dotenv import load_dotenv
from fastapi.middleware.cors import CORSMiddleware

# LangChain Imports
from langchain_community.document_loaders import PyPDFLoader, Docx2txtLoader
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_chroma import Chroma
from langchain_experimental.text_splitter import SemanticChunker
from langchain_perplexity import ChatPerplexity
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser

load_dotenv()
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins (React, Mobile, etc.)
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods (POST, GET, OPTIONS, etc.)
    allow_headers=["*"],  # Allows all headers
)

API_KEY = os.getenv("PPLX_API_KEY")

if not API_KEY:
    raise ValueError("API Key not found! Make sure PPLX_API_KEY is in your .env file.")
# --- CONFIGURATION ---
os.environ["PPLX_API_KEY"] = API_KEY

UPLOAD_DIR = "uploaded_files"
DB_DIR = "vector_db"
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(DB_DIR, exist_ok=True)

# 1. SETUP AI COMPONENTS
# The "Librarian" (Embeddings) - same as before
embedding_function = HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2")

# The "Database" (Chroma)
vector_store = Chroma(
    persist_directory=DB_DIR, 
    embedding_function=embedding_function
)

# The "Brain" (Perplexity Sonar Pro)
# "sonar-pro" is their smart model with live search capabilities.
llm = ChatPerplexity(
    model="sonar-pro", 
    temperature=0.1  # Low temperature = more factual, less creative
)

# 2. PROMPT TEMPLATE
# This tells the AI how to behave.
template = """
You are an intelligent assistant named 'Context AI'. You have access to the following context (excerpts from user documents).

CONTEXT FROM DOCUMENTS:
{context}

USER QUESTION: 
{question}

INSTRUCTIONS:
1. **Structure your answer:** - Start with a direct answer in **bold**.
   - Use a "Key Details" section with bullet points for explanation.
   - Never write long paragraphs; break them up.
2. **Formatting:** Use Markdown (## Headers, * Bullets, **Bold**) strictly.
3. **Sources:** If the answer is in the document, mention it. If not, state you are using general knowledge.

EXAMPLE FORMAT:
**The project name is Vitalyze.ai.**

### Key Details
* It is an AI-powered health hub.
* The main goal is to simplify medical reports.
* It features a comparative mode and a simple explanation mode.
"""
prompt = ChatPromptTemplate.from_template(template)

# 3. INPUT MODEL (for the API)
class QueryRequest(BaseModel):
    question: str

# --- ENDPOINTS ---

@app.post("/upload/")
async def upload_document(file: UploadFile = File(...)):
    # (This code remains exactly the same as Stage 1)
    file_path = os.path.join(UPLOAD_DIR, file.filename)
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        return {"error": f"Failed to save file: {str(e)}"}

    if file.filename.endswith(".pdf"):
        loader = PyPDFLoader(file_path)
        documents = loader.load()
    elif file.filename.endswith(".docx"):
        loader = Docx2txtLoader(file_path)
        documents = loader.load()
    else:
        return {"error": "Unsupported file format"}

    text_splitter = SemanticChunker(
        embedding_function, 
        breakpoint_threshold_type="percentile" 
    )
    chunked_documents = text_splitter.split_documents(documents)
    vector_store.add_documents(chunked_documents)

    return {"status": "success", "chunks": len(chunked_documents)}


@app.post("/chat/")
async def chat_endpoint(request: QueryRequest):
    """
    1. Search Database -> 2. Build Prompt -> 3. Ask Perplexity
    """
    user_question = request.question

    # Step A: Search the database for the 3 most relevant chunks of text
    results = vector_store.similarity_search(user_question, k=3)
    
    # Combine the text from those chunks into one string
    context_text = "\n\n".join([doc.page_content for doc in results])

    # Step B: Create the Chain (Prompt -> LLM -> Text Output)
    chain = prompt | llm | StrOutputParser()

    # Step C: Run the chain
    response = chain.invoke({
        "context": context_text,
        "question": user_question
    })

    return {"response": response, "source_docs": [doc.metadata for doc in results]}