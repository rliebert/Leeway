# Project Context Record

## Development Procedure
For each feature or feature set, we follow this systematic approach:

1. Plan & Document
   - Document the feature's technical specifications
   - Define database schema
   - Outline API endpoints
   - List frontend components
   - Describe key operations
   - Add to this context record before implementation

2. Build & Test
   - Implement the documented features
   - Follow test-driven development where applicable
   - Verify functionality through manual testing
   - Address any issues discovered during testing

3. Documentation Review
   - Update documentation based on implementation insights
   - Record any deviations from the original plan
   - Document lessons learned
   - Update technical specifications if approach changed

This procedure ensures consistent development practices and maintains accurate documentation throughout the project lifecycle.

## Project Overview
Leeway - A team communication platform built with React, Express, and PostgreSQL

## Key Technical Decisions
1. Authentication System:
   - Uses Passport.js with local strategy
   - Password hashing with scrypt
   - Session management with Express session and MemoryStore
   - Username-based authentication

2. Database Structure:
   - PostgreSQL with Drizzle ORM
   - Explicit table relationships
   - Auto-incrementing serial IDs
   - Schema managed through Drizzle migrations

3. Frontend Architecture:
   - React with TypeScript
   - Client-side auth context with @tanstack/react-query
   - Shadcn/UI components
   - Wouter for routing
   - Real-time updates via WebSocket

## Current Implementation Status
1. Completed:
   - User authentication (username/password)
   - Channel management with sections
   - Drag-and-drop channel organization
   - Real-time messaging
   - File uploads
   - Message search functionality
   - Direct messaging interface
   - Responsive sidebar layout

2. In Progress:
   - Message threads and replies
   - User presence indicators
   - File attachment previews
   - Message reactions

## Implementation Details by Feature

### Channel Management
1. Database Schema:
```typescript
export const channels = pgTable("channels", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").unique().notNull(),
  description: text("description"),
  section_id: uuid("section_id").references(() => sections.id),
  creator_id: uuid("creator_id").references(() => users.id),
  created_at: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`),
  order_index: integer("order_index").notNull().default(0),
});
```

2. API Endpoints:
   - POST /api/channels - Create new channel
   - PATCH /api/channels/:id - Update channel details
   - DELETE /api/channels/:id - Remove channel
   - GET /api/channels - List all channels

3. Frontend Components:
   - ChannelSidebar.tsx:
     - Channel creation dialog
     - Channel list with edit/delete options
     - Section organization
   - Uses @tanstack/react-query for data management
   - Real-time updates via WebSocket

4. Key Operations:
   - Channel Creation:
     - Validates unique channel names
     - Optional section assignment
     - Creator permissions
   - Channel Updates:
     - Permission checks (creator/admin only)
     - Real-time UI updates
   - Channel Deletion:
     - Cascading deletion of messages
     - Permission validation
     - WebSocket notification


### Real-time Messaging
1. Database Schema:
```typescript
export const messages = pgTable("messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  content: text("content").notNull(),
  user_id: uuid("user_id").references(() => users.id).notNull(),
  channel_id: uuid("channel_id").references(() => channels.id).notNull(),
  parent_id: uuid("parent_id").references(() => messages.id),
  created_at: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`),
  updated_at: timestamp("updated_at"),
});
```

2. WebSocket Implementation:
   - Dedicated WebSocket server (websocket.ts)
   - Message types: 'subscribe', 'unsubscribe', 'message', 'typing'
   - Real-time channel subscriptions
   - Automatic reconnection handling
   - Heartbeat mechanism for connection health

3. Frontend Components:
   - MessageList.tsx:
     - Message display and threading
     - Infinite scroll
     - Unread message tracking
   - Message.tsx:
     - Individual message rendering
     - Reply functionality
     - File attachment display
   - ChatInput.tsx:
     - Message composition
     - File upload integration
     - Typing indicators

4. Key Operations:
   - Message Sending:
     - WebSocket delivery
     - Optimistic updates
     - Failure handling
   - Message Threading:
     - Parent-child relationships
     - Thread continuation
   - Real-time Updates:
     - Channel subscription management
     - Message synchronization
     - Typing indicators

### File Sharing
1. Database Schema:
```typescript
export const file_attachments = pgTable("file_attachments", {
  id: uuid("id").defaultRandom().primaryKey(),
  message_id: uuid("message_id").references(() => messages.id),
  file_url: text("file_url").notNull(),
  file_name: text("file_name").notNull(),
  file_type: text("file_type").notNull(),
  file_size: integer("file_size").notNull(),
  created_at: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`),
});
```

2. API Endpoints:
   - POST /api/upload - Upload file(s)
   - GET /uploads/:filename - Serve uploaded files
   - DELETE /api/attachments/:id - Remove attachment

3. Frontend Components:
   - FileUpload.tsx:
     - File selection interface
     - Upload progress tracking
     - File type validation
   - Message.tsx:
     - File preview integration
     - Download options
     - Image gallery view

4. Key Operations:
   - File Upload:
     - Multer middleware configuration
     - Size and type validation
     - Progress tracking
   - File Storage:
     - Local storage management
     - File naming strategy
     - Access control
   - Preview Generation:
     - Image thumbnail creation
     - File type detection
     - Preview limitations

### Message Threading
1. Database Schema:
```typescript
// Already implemented in messages table
export const messages = pgTable("messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  content: text("content").notNull(),
  user_id: uuid("user_id").references(() => users.id).notNull(),
  channel_id: uuid("channel_id").references(() => channels.id).notNull(),
  parent_id: uuid("parent_id").references(() => messages.id), // For thread replies
  created_at: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`),
  updated_at: timestamp("updated_at"),
});
```

2. API Endpoints:
   - GET /api/messages/:messageId/replies - Get thread replies
   - POST /api/messages/:messageId/replies - Add reply to thread
   - GET /api/messages/:messageId/thread - Get full thread context

3. Frontend Components:
   - ThreadModal.tsx:
     - Thread view with reply chain
     - Reply composition
     - Thread participant list
   - Message.tsx updates:
     - Thread preview
     - Reply count
     - Thread expansion UI
   - MessageList.tsx updates:
     - Thread indicators
     - Collapsible thread view

4. Key Operations:
   - Thread Creation:
     - First reply creates thread
     - Parent-child message relationship
     - Thread metadata updates
   - Reply Management:
     - Real-time reply notifications
     - Reply count tracking
     - Thread participant tracking
   - Thread Navigation:
     - Jump to thread context
     - Expand/collapse threads
     - Thread history loading


## Critical Implementation Details
1. Auth Flow:
   - Authentication state managed through useUser hook
   - Session persistence with Express session
   - Protected routes and API endpoints

2. Database Access:
   - Drizzle ORM for type-safe queries
   - Foreign key relationships enforced
   - Automatic schema synchronization

3. Security Considerations:
   - Password hashing with scrypt
   - Session-based authentication
   - Protected API routes
   - Secure WebSocket connections

## Known Issues
1. Authentication:
   - Session management needs optimization for scale
   - Password reset functionality not implemented

2. Real-time Features:
   - WebSocket reconnection handling needs improvement
   - Message delivery confirmation pending

## Next Steps
1. Messaging:
   - Implement thread replies
   - Add emoji reactions
   - Message editing and deletion
   - Message delivery status

2. User Experience:
   - Add user presence indicators
   - Implement typing indicators
   - Add file preview capabilities
   - Improve mobile responsiveness

3. Performance:
   - Implement message pagination
   - Optimize WebSocket connections
   - Add caching layer

## Development Environment
1. Required Services:
   - PostgreSQL database
   - Node.js runtime
   - File storage system

2. Environment Variables:
   - DATABASE_URL for PostgreSQL connection
   - Session secret
   - File storage configuration

## Common Issues/Solutions
1. Database Synchronization:
   - Use `npm run db:push` to sync schema changes
   - Check foreign key constraints
   - Verify table relationships

2. WebSocket Connections:
   - Handle reconnection gracefully
   - Implement message queuing
   - Monitor connection status

3. File Uploads:
   - Configure proper MIME types
   - Implement size limits
   - Add progress indicators

# Next Priorities
1. Message Threading:
   - Implement thread UI
   - Add reply functionality
   - Show thread participants

2. File Handling:
   - Add preview capabilities
   - Implement progress tracking
   - Add file type validation

3. User Experience:
   - Add loading states
   - Improve error handling
   - Enhance mobile layout