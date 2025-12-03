# Disease Predictor

**Project:** Disease Prediction Application (Final year major project)  
**Team:** Aryan Rawtani + 2 members  
**Status:** Backend ready (`ready/demo-backend` branch)

---

## Overview

Disease Predictor is a web app that helps users identify possible diseases based on their symptoms. After experimenting with several machine learning models, we found that **Logistic Regression** gave the best results for our labeled dataset.

- **Backend:** Django REST Framework, PostgreSQL
- **ML:** scikit-learn (**Logistic Regression**; previously SVM), model artifacts (`model.pkl`, `columns.pkl`, `label_encoder.pkl`)
- **Frontend:** React.js (details below)

## Frontend

Our frontend is built with **React.js** and is designed to be simple, intuitive, and responsive.

### What you can do

- Register and log in as a user
- Select symptoms from a searchable, multi-select list
- Get instant disease predictions based on your input
- (For admins) Trigger model training and upload patient data
- Enjoy a smooth experience on both desktop and mobile

### How it works

1. **Authentication:**  
   Users can sign up and log in. Tokens are stored securely (usually in local storage) and sent with each API request.

2. **Symptom Input:**  
   Just pick your symptoms from the list. The app sends them as a JSON array to the backend’s `/api/disease/predict/` endpoint.

3. **Prediction Results:**  
   The predicted disease (and any extra info) is displayed right away.

4. **Admin Tools:**  
   Admins can retrain the model and upload patient data directly from the UI.

### Running the Frontend Locally

1. Go to the frontend directory:

   ```bash
   cd frontend
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Set the API endpoint:  
   Update the API base URL in your frontend config (like `.env`) to point to your backend.

4. Start the app:
   ```bash
   npm start
   ```
   By default, it runs at [http://localhost:3000](http://localhost:3000).

## Features

- User registration & token-based authentication (DRF TokenAuth)
- Train a **Logistic Regression** model from `Training.csv`  
  _(We tried different models, but Logistic Regression worked best for our labeled data)_
- Predict diseases from symptoms
- (Optional) Insert patient data from CSV for admin view

### API Endpoints

- `POST /api/accounts/register/` — Register user (returns token)
- `POST /api/accounts/login/` — Login (returns token)
- `GET  /api/accounts/me/` — Get current user (token required)
- `GET  /api/disease/train/` — Train model (returns accuracy)
- `POST /api/disease/predict/` — Predict disease  
  Example body:
  ```json
  { "symptoms": ["itching", "skin_rash", "chills"] }
  ```
- `POST /api/disease/insertpd/` — (Admin) Insert CSV records into DB

## Getting Started (Backend)

1. **Clone the repository**
   ```bash
   git clone https://github.com/aryanraw02/disease-predictor.git
   cd disease-predictor
   ```
2. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```
3. **Configure the database**  
   Update `settings.py` with your PostgreSQL credentials.

4. **Apply migrations**

   ```bash
   python manage.py migrate
   ```

5. **Run the server**

   ```bash
   python manage.py runserver
   ```

6. **Train the model**  
   Visit `GET /api/disease/train/` or use an API client.

## Contributing

Contributions are welcome! If you have suggestions or want to add features, feel free to open an issue or submit a pull request.

---

**License:** MIT  
**Contact:** Aryan Rawtani
