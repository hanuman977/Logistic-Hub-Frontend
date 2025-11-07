# Logistics Tracking Hub Frontend

A React-based frontend application for managing and tracking logistics consignments, built with Vite, TypeScript, and TailwindCSS.

## Features

- 🚚 Real-time consignment tracking
- 🏢 Hub-based delivery management
- 🔒 AWS Cognito authentication
- 📱 Responsive design for all devices
- 🌐 Public tracking page for customers
- 🎯 Operator dashboard for logistics management

## Tech Stack

- **Framework**: React with TypeScript
- **Build Tool**: Vite
- **Styling**: TailwindCSS
- **Authentication**: AWS Cognito with OAuth2.0
- **Deployment**: Docker + Nginx
- **CI/CD**: AWS ECR support

## Project Structure

```
src/
  ├── components/         # Reusable UI components
  ├── contexts/          # React context providers
  ├── pages/             # Main application pages
  ├── types/            # TypeScript type definitions
  └── utils/            # Utility functions and API clients
```

## Quick Start

1. Install dependencies:
   ```bash
   npm install
   ```

2. Configure environment variables:
   ```bash
   cp .env.example .env.local
   # Edit .env.local with your settings
   ```

3. Start development server:
   ```bash
   npm run dev
   ```

4. Build for production:
   ```bash
   npm run build
   ```

## Deployment

See our detailed deployment guides:
- [Standard EC2 Deployment](./DEPLOYMENT.md)
- [AWS ECR Deployment](./ECR-DEPLOYMENT.md)

## Authentication

For authentication setup and configuration, see [Authentication Guide](./AUTHENTICATION.md)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

MIT License - See [LICENSE](LICENSE) for details
