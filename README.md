# Leeway - Team Communication Platform

Leeway is an advanced team communication platform designed to revolutionize workplace collaboration through intelligent, secure, and flexible messaging solutions. Built with modern web technologies, it provides a comprehensive real-time communication ecosystem with robust infrastructure for team interaction and administrative control.

## Features

- Real-time messaging with WebSocket support
- Channel-based communication with sections organization
- Drag-and-drop channel management
- User authentication and session management
- File uploads and sharing
- Message search functionality
- Direct messaging between users
- Responsive design for all devices

## Tech Stack

### Frontend
- React.js with TypeScript
- Shadcn UI components
- TanStack Query for data fetching
- Wouter for routing
- WebSocket for real-time updates
- Tailwind CSS for styling
- @hello-pangea/dnd for drag-and-drop functionality

### Backend
- Express.js server
- PostgreSQL database with Drizzle ORM
- Passport.js for authentication
- WebSocket server for real-time communication
- Multer for file upload handling

## Getting Started

### Prerequisites

- Node.js (v20 or later)
- PostgreSQL database
- npm or yarn package manager

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/leeway.git
cd leeway
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
Create a `.env` file in the root directory with the following variables:
```
DATABASE_URL=postgresql://user:password@localhost:5432/leeway
```

4. Push the database schema:
```bash
npm run db:push
```

5. Start the development server:
```bash
npm run dev
```

The application will be available at `http://localhost:5000`

## Project Structure

```
├── client/                 # Frontend React application
│   ├── src/
│   │   ├── components/    # React components
│   │   ├── hooks/        # Custom React hooks
│   │   ├── lib/          # Utility functions and configuration
│   │   └── pages/        # Page components
├── db/                    # Database configuration and schema
├── server/               # Backend Express application
│   ├── routes.ts        # API routes
│   └── vite.ts          # Vite configuration for development
└── uploads/             # File upload directory
```

## Development Guidelines

### Frontend
- Use the existing Shadcn + Tailwind CSS setup for components
- Follow the established component structure in `client/src/components`
- Use TanStack Query for data fetching and caching
- Implement proper error handling and loading states
- Maintain type safety with TypeScript

### Backend
- Follow RESTful API design principles
- Use Drizzle ORM for database operations
- Implement proper error handling and validation
- Maintain secure authentication practices
- Keep routes organized and documented

### Database
- Use Drizzle for schema management
- Never manually write SQL migrations
- Keep relations properly defined in schema
- Use transactions for complex operations

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.
