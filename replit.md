# PDF Splitter Application

## Overview

This is a full-stack web application for splitting PDF files into multiple documents based on user-defined page ranges or individual page selections. The application features a modern React frontend with shadcn/ui components and an Express.js backend that handles PDF processing using pdf-lib. Users can upload PDF files, specify splitting instructions using an intuitive format (e.g., "1-3, 5-7, 10"), and download the resulting split files as a ZIP archive.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript, built using Vite for fast development and optimized builds
- **UI Library**: shadcn/ui component system built on Radix UI primitives for accessible, customizable components
- **Styling**: Tailwind CSS with CSS custom properties for theming, supporting both light and dark modes
- **State Management**: React hooks for local state, TanStack Query for server state management and caching
- **Routing**: Wouter for lightweight client-side routing
- **File Structure**: Component-based architecture with separation of UI components, pages, hooks, and utilities

### Backend Architecture
- **Framework**: Express.js with TypeScript for type safety and modern JavaScript features
- **PDF Processing**: pdf-lib library for reading, manipulating, and creating PDF documents
- **File Handling**: Multer middleware for multipart/form-data file uploads with memory storage
- **Archive Creation**: JSZip for creating downloadable ZIP archives containing split PDF files
- **Development**: Hot module replacement via Vite integration in development mode
- **Error Handling**: Centralized error middleware with proper HTTP status codes and JSON responses

### Data Storage Solutions
- **Database**: PostgreSQL as the primary database with Drizzle ORM for type-safe database operations
- **Schema**: Defined user and PDF job tracking tables for storing processing history and file metadata
- **Fallback Storage**: In-memory storage implementation for development and testing environments
- **Session Management**: PostgreSQL-backed session storage using connect-pg-simple

### Authentication and Authorization
- **Session-based Authentication**: Traditional server-side sessions stored in PostgreSQL
- **User Management**: Basic user registration and login functionality with password hashing
- **API Protection**: Session validation middleware for protected routes

### External Dependencies
- **Database**: Neon Database (PostgreSQL) for production data storage
- **PDF Processing**: pdf-lib for client-side PDF manipulation and splitting operations
- **UI Components**: Extensive use of Radix UI primitives for accessibility-compliant components
- **Development Tools**: ESBuild for production builds, TSX for development server, Drizzle Kit for database migrations
- **Styling**: Tailwind CSS with PostCSS for CSS processing and vendor prefixing
- **Fonts**: Google Fonts integration (Architects Daughter, DM Sans, Fira Code, Geist Mono)
- **Replit Integration**: Vite plugins for Replit-specific development features including error overlays and dev banners