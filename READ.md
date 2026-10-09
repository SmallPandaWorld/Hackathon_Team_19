### Backend
1. Go into backend folder
2. create a conda and activate it
3.  ```
   pip install -r requirements.txt
   ```

### How to Start le Backend [don't be in the backend folder]: 
```
uvicorn backend.main:app --reload
```

### How to access the backend in the browser : 
http://127.0.0.1:8000/docs#/
(optionally change ip)

# Frontend
1. install Node.js (v22.20.0)
    https://nodesource.com/products/distributions
2. npm install

### After each backend change : 
```
npx orval
```

### To Run frontend 
```
npm run dev
```

Tailwind is for Styling (classname and so on)
See https://tailwindcss.com/docs/styling-with-utility-classes
