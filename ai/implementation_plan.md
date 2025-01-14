# RAG Chatbot Implementation Plan for Leeway

## Phase 1: Database Setup
1. [ ] Install pgvector extension
2. [ ] Create message_embeddings table with vector support
3. [ ] Create ai.rob user with system role

## Phase 2: Dependencies & Configuration
1. [ ] Verify OpenAI API key setup
2. [ ] Configure LangChain with our Neon PostgreSQL setup
3. [ ] Update rag service with proper vector store integration

## Phase 3: Training Pipeline
1. [ ] Create training script to:
   - Fetch all of rliebert's messages from database
   - Generate embeddings using OpenAI API
   - Store embeddings in message_embeddings table
2. [ ] Implement real-time embedding generation for new messages

## Phase 4: RAG Implementation
1. [ ] Implement proper vector similarity search
2. [ ] Create message retrieval chain using LangChain
3. [ ] Set up AI response generation with context

## Phase 5: WebSocket Integration
1. [ ] Update WebSocket handler to:
   - Detect questions in messages
   - Trigger RAG pipeline
   - Send AI responses as ai.rob

## Implementation Steps:

### Step 1: Database Setup
```sql
-- Enable vector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create message_embeddings table
CREATE TABLE IF NOT EXISTS message_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    embedding vector(1536),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create index for vector similarity search
CREATE INDEX ON message_embeddings USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);

-- Create ai.rob user
INSERT INTO users (username, email, password_hash, display_name, is_bot)
VALUES ('ai.rob', 'ai.rob@leeway.app', 'not_applicable', 'AI Rob', true)
ON CONFLICT (username) DO NOTHING;
```

### Step 2: Update RAG Service
We'll enhance the RAG service to use LangChain's vector store capabilities with our Neon PostgreSQL database:

1. Update dependencies
2. Implement proper vector store integration
3. Set up retrieval and response generation chains

### Step 3: Training Process
Create a training script that:
1. Fetches rliebert's messages
2. Generates embeddings using OpenAI's text-embedding-3-small model
3. Stores embeddings in our vector store

### Step 4: Integration
1. Update WebSocket handler to use enhanced RAG service
2. Implement proper error handling and rate limiting
3. Add logging for monitoring and debugging

### Verification Steps:
1. Verify database setup
2. Test embedding generation
3. Validate similarity search
4. Test end-to-end question answering
5. Monitor performance and response quality
