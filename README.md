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
