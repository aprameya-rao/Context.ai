import { useState, useRef, useEffect } from "react";
import ReactMarkdown from 'react-markdown';
import axios from "axios";
import { Upload, Send, Bot, User, CheckCircle, Loader2 } from "lucide-react";
import "./App.css";

function App() {
  const [file, setFile] = useState(null);
  const [uploadStatus, setUploadStatus] = useState("");
  const [messages, setMessages] = useState([
    { 
      role: "ai", 
      content: "**Hello!** Upload a document, and I can answer questions based on its content." 
    }
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  // Auto-scroll to bottom of chat
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Handle File Selection
  const handleFileChange = async (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setUploadStatus("Uploading...");

    const formData = new FormData();
    formData.append("file", selectedFile);

    try {
      await axios.post("http://127.0.0.1:8000/upload/", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setUploadStatus("File processed successfully!");
    } catch (error) {
      console.error("Upload error:", error);
      setUploadStatus("Failed to upload file.");
    }
  };

  // Handle Chat Message
  const handleSend = async () => {
    if (!input.trim()) return;

    const userMessage = { role: "user", content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const response = await axios.post("http://127.0.0.1:8000/chat/", {
        question: userMessage.content,
      });

      const aiMessage = {
        role: "ai",
        content: response.data.response,
        sources: response.data.source_docs,
      };

      setMessages((prev) => [...prev, aiMessage]);
    } catch (error) {
      console.error("Chat error:", error);
      setMessages((prev) => [
        ...prev,
        { role: "ai", content: "Sorry, I encountered an error. Please try again." },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container">
      {/* Sidebar */}
      <div className="sidebar">
        <div className="logo">
          <Bot size={28} /> Context.ai
        </div>
        
        <div className="upload-section">
          <p style={{marginBottom: '10px', fontWeight: '500'}}>Document Context</p>
          <label className="upload-box">
            <input 
              type="file" 
              accept=".pdf,.docx" 
              onChange={handleFileChange} 
              style={{display: 'none'}} 
            />
            <Upload size={24} style={{marginBottom: '10px', color: '#64748b'}} />
            <p style={{fontSize: '0.9rem', color: '#64748b'}}>
              Click to upload PDF or DOCX
            </p>
          </label>

          {file && (
            <div className="file-status">
              <CheckCircle size={16} />
              <span style={{overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>
                {uploadStatus}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div className="chat-area">
        <div className="messages-container">
          {messages.map((msg, index) => (
            <div key={index} className={`message ${msg.role}`}>
              <div className={`avatar ${msg.role}`}>
                {msg.role === "ai" ? <Bot size={20} /> : <User size={20} />}
              </div>
              
              <div className="message-content">
                {/* Render Markdown for AI, Plain text for User */}
                {msg.role === "ai" ? (
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                ) : (
                  msg.content
                )}
                
                {/* Smart Source Rendering */}
                {msg.sources && msg.sources.length > 0 && (
                  <div className="source-box">
                    <div className="source-title">Sources:</div>
                    <div className="source-list">
                      {/* Logic: Deduping and cleaning filenames */}
                      {[...new Set(msg.sources.map(src => {
                          const name = src.source ? src.source.split('/').pop() : "Document";
                          // Only show page if it exists (PDFs), skip for DOCX if undefined
                          const page = src.page !== undefined ? ` (Page ${src.page + 1})` : "";
                          return `${name}${page}`;
                      }))].map((uniqueSource, i) => (
                        <span key={i} className="source-tag">
                          {uniqueSource}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
          
          {isLoading && (
            <div className="message ai">
              <div className="avatar ai"><Bot size={20} /></div>
              <div className="message-content">
                <Loader2 className="animate-spin" size={20} />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="input-area">
          <input
            type="text"
            placeholder="Ask a question about your document..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && handleSend()}
            disabled={isLoading}
          />
          <button className="send-btn" onClick={handleSend} disabled={isLoading || !input.trim()}>
            <Send size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;