# RAG Chatbot Implementation Plan for Leeway

## Phase 1: Database Setup ✓
1. [x] Install pgvector extension
2. [x] Create message_embeddings table with vector support
3. [x] Create ai.rob user with system role

## Phase 2: Dependencies & Configuration ✓
1. [x] Verify OpenAI API key setup
2. [x] Configure LangChain with our Neon PostgreSQL setup
3. [x] Update rag service with proper vector store integration

## Phase 3: Training Pipeline
1. [x] Create training script to:
   - Fetch all of rliebert's messages from database
   - Generate embeddings using OpenAI API
   - Store embeddings in message_embeddings table
2. [x] Implement real-time embedding generation for new messages

## Phase 4: RAG Implementation ✓
1. [x] Implement proper vector similarity search
2. [x] Create message retrieval chain using LangChain
3. [x] Set up AI response generation with context

## Phase 5: WebSocket Integration ✓
1. [x] Update WebSocket handler to:
   - Detect questions in messages
   - Trigger RAG pipeline
   - Send AI responses as ai.rob

## Current Architecture:

### Database Schema:
```sql
-- Message embeddings table (Implemented)
CREATE TABLE message_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    embedding vector(1536),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Vector similarity search index (Implemented)
CREATE INDEX ON message_embeddings USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);
```

## Remaining Implementation Tasks:

### 1. Run Initial Training
```typescript
// Execute training script
npm run train-embeddings

// Verify embeddings
SELECT COUNT(*) FROM message_embeddings;
```

### 2. Testing Process:
1. Verify Questions Detection:
   - Send test messages ending with "?"
   - Monitor WebSocket events
   - Check RAG pipeline activation

2. Response Generation:
   - Verify context retrieval
   - Check response formatting
   - Validate rliebert's style matching

3. Performance Monitoring:
   - Track embedding storage growth
   - Monitor response times
   - Check retraining effectiveness

### 3. Quality Control:
1. Response Quality:
   - Track similarity to rliebert's style
   - Monitor question relevance
   - Implement feedback mechanism

2. System Health:
   - Database size monitoring
   - Embedding generation metrics
   - Training pipeline status

## Integration Steps:
1. Update WebSocket handler
2. Add monitoring endpoints
3. Set up quality tracking
4. Implement storage checks

## Success Metrics:
1. Response accuracy > 85%
2. Query latency < 2 seconds
3. Training completion < 5 minutes
4. Storage growth < 1GB/week

## Next Steps:
1. Execute initial training
2. Run end-to-end tests
3. Implement monitoring
4. Fine-tune responses