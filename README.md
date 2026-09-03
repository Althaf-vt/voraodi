# Voraodi

Voraodi is a full-stack e-commerce web application utilizing Node.js, Express, and MongoDB. It features integrated user authentication, payment processing, product management, and dynamic reporting via charting and PDF generation.

## Architecture & Tech Stack
- **Backend:** Node.js, Express.js
- **Database:** MongoDB via Mongoose ORM
- **Authentication:** Passport.js (Local & Google OAuth 2.0), bcrypt
- **Frontend Views:** EJS templating engine, Chart.js
- **Payments:** Cashfree Payment Gateway (with Razorpay support integrations)
- **Utilities:** Multer (file uploads), Sharp (image processing), Nodemailer (emails), PDFKit & ExcelJS (reporting)

## Prerequisites & Local Installation

Ensure you have the following installed locally:
- **Node.js** (v18.x or higher recommended)
- **npm** (v9.x or higher)
- **MongoDB** (Local instance or Atlas connection string)

### Installation Steps

1. Clone the repository:
   ```bash
   git clone https://github.com/Althaf-vt/voraodi.git
   cd voraodi
   ```
2. Install all dependencies:
   ```bash
   npm install
   ```

## Environment & Configuration

Create a `.env` file in the root directory and configure the necessary variables for your local development setup.

Example `.env` configuration:
```env
PORT=3000
MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.../voraodi-Cloud
SESSION_SECRET=your-super-long-random-secret-key
NODEMAILER_EMAIL=your-email@gmail.com
NODEMAILER_PASSWORD=your-app-specific-password
GOOGLE_CLIENT_ID=your-google-oauth-client-id
GOOGLE_CLIENT_SECRET=your-google-oauth-client-secret
CASHFREE_CLIENT_ID=your-cashfree-client-id
CASHFREE_CLIENT_SECRET=your-cashfree-client-secret
CASHFREE_ENV=SANDBOX
```

## Application Scripts & Workflows

The following scripts are available via `package.json` to manage the application lifecycle:

- **Start Development Server**:
  ```bash
  npm start
  ```
  This will execute `nodemon server` and watch for local file changes.

### Core Data Flows
- **Authentication:** Uses Express sessions and Passport.js for session persistence.
- **File Uploads:** Handled via Multer and optimized using Sharp before being stored in the `public` directory.
- **Reporting:** Admin dashboards utilize Chart.js for visualization, and server-side PDFKit/ExcelJS exports for downloadable reports.

## Testing & Verification

*Note: Automated testing suites are currently being integrated.*

For manual verification:
1. Ensure your local `.env` contains valid Sandbox credentials for Cashfree.
2. Start the application (`npm start`).
3. Navigate to `http://localhost:3000`.
4. Verify user registration, Google OAuth login flow, and a sandbox checkout.
5. Check backend logs for any unhandled rejections or connection warnings regarding MongoDB.

## Contribution Guidelines & License

### Branching Convention
- `feat/<feature-name>`: For new features
- `fix/<bug-name>`: For bug fixes
- Ensure your changes are thoroughly tested locally before opening a Pull Request against `main`.

### License
This project is open-sourced under the **ISC License**. See `package.json` for repository details and issue tracking:
- [Issue Tracker](https://github.com/Althaf-vt/voraodi/issues)
