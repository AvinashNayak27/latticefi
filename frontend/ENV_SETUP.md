# Environment Variables Setup

This project uses environment variables to configure the backend API URL for different environments.

## Environment Files

- `.env.development` - Used during local development (`npm run dev`)
- `.env.production` - Used when building for production (`npm run build`)
- `.env.example` - Template file (committed to git)

## Configuration

### Development
```
VITE_BACKEND_URL=http://localhost:8000
```

### Production
```
VITE_BACKEND_URL=https://avantis-backend.vercel.app
```

## Usage

The frontend automatically uses the correct backend URL based on the environment:

- **Development mode**: `npm run dev` → Uses `http://localhost:8000`
- **Production build**: `npm run build` → Uses `https://avantis-backend.vercel.app`

## How It Works

1. Vite automatically loads `.env.development` in development mode
2. Vite automatically loads `.env.production` when building for production
3. The backend URL is accessed in code via `import.meta.env.VITE_BACKEND_URL`
4. All environment variables must be prefixed with `VITE_` to be exposed to the client

## Testing Locally

To test with the local backend:
1. Start your backend server on port 8000
2. Run `npm run dev` in the frontend directory
3. The app will now connect to `http://localhost:8000`

To test with the production backend locally:
1. Update `.env.development` to use the production URL, or
2. Create a `.env.local` file with `VITE_BACKEND_URL=https://avantis-backend.vercel.app`

## Security Note

The actual `.env.development` and `.env.production` files are gitignored and not committed to version control. Only `.env.example` is tracked.

