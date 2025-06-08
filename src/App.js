import React from 'react';
import './App.css';
import MapPage from './MapPage';  // これ OK！

function App() {
  return (
    <div className="App">
      <header className="App-header">
        <h1>Taste MAP アプリ</h1>
      </header>
      <main>
        <MapPage />   {/* ← ここ！！ */}
      </main>
    </div>
  );
}

export default App;