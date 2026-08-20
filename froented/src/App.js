import React, { useEffect, useState } from 'react';
import axios from 'axios';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Bar, Line, Pie, Doughnut, Bubble } from 'react-chartjs-2';
import './App.css';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

const API_BASE_URL = (process.env.REACT_APP_API_BASE_URL || 'http://localhost:5000').replace(/\/$/, '');

const toNumber = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/[$,\s]/g, '').replace(/%$/, '');
  if (!normalized || normalized === '-') return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
};

const isNumericColumn = (rows, column) => {
  const values = rows.map((row) => row[column]).filter((value) => value !== '' && value !== null && value !== undefined);
  return values.length > 0 && values.filter((value) => toNumber(value) !== null).length / values.length >= 0.8;
};

const isDateColumn = (rows, column) => {
  const values = rows.map((row) => row[column]).filter((value) => value !== '' && value !== null && value !== undefined);
  if (!values.length || isNumericColumn(rows, column)) return false;
  const dateValues = values.filter((value) => !Number.isNaN(Date.parse(String(value))));
  return dateValues.length / values.length >= 0.8;
};

const getChartRecommendations = (rows, columns, xAxis, yAxis) => {
  if (!rows.length || !xAxis || !yAxis) return [];

  const uniqueXValues = new Set(rows.map((row) => String(row[xAxis] ?? '')).filter(Boolean)).size;
  const numericColumns = columns.filter((column) => isNumericColumn(rows, column));
  const recommendations = [];

  if (isDateColumn(rows, xAxis)) {
    recommendations.push({ type: 'line', title: 'Line chart', reason: 'Your X-axis contains dates, so this will show change over time clearly.' });
  } else if (isNumericColumn(rows, xAxis) && numericColumns.length >= 2) {
    recommendations.push({ type: 'bubble', title: 'Bubble chart', reason: 'Both selected axes are numeric, making this useful for comparing their relationship.' });
  } else {
    recommendations.push({ type: 'clusteredBar', title: 'Bar chart', reason: 'Your data compares a numeric value across categories, which is easiest to scan as bars.' });
  }

  if (!isNumericColumn(rows, xAxis) && uniqueXValues > 1 && uniqueXValues <= 8) {
    recommendations.push({ type: 'doughnut', title: 'Doughnut chart', reason: 'There are only a few categories, so proportions can be compared without becoming cluttered.' });
  }

  return recommendations;
};

const ChartPreview = ({ type }) => (
  <div className={`chart-preview chart-preview-${type}`} aria-hidden="true">
    {type === 'clusteredBar' && <><i /><i /><i /><i /><i /></>}
    {type === 'line' && <svg viewBox="0 0 180 80" preserveAspectRatio="none"><polyline points="5,61 38,43 70,52 109,20 143,33 175,9" /></svg>}
    {type === 'pie' && <span className="preview-pie" />}
    {type === 'doughnut' && <span className="preview-doughnut" />}
    {type === 'bubble' && <><i /><i /><i /><i /><i /></>}
  </div>
);

function App() {
  const [token, setToken] = useState(() => localStorage.getItem('authToken') || '');
  const [authMode, setAuthMode] = useState('login');
  const [authName, setAuthName] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authStatus, setAuthStatus] = useState('');
  const [file, setFile] = useState(null);
  const [uploadStatus, setUploadStatus] = useState('');
  const [isUploaded, setIsUploaded] = useState(false);
  const [showUploadScreen, setShowUploadScreen] = useState(false);
  const [showChartPicker, setShowChartPicker] = useState(false);
  const [showMergePrompt, setShowMergePrompt] = useState(false);
  const [pendingFile, setPendingFile] = useState(null);
  const [globalData, setGlobalData] = useState([]);
  const [columns, setColumns] = useState([]);
  const [xAxis, setXAxis] = useState('');
  const [yAxis, setYAxis] = useState('');
  const [chartType, setChartType] = useState('clusteredBar');

  const authConfig = () => ({ headers: { Authorization: `Bearer ${token}` } });

  const handleAuthFailure = (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('authToken');
      setToken('');
      setIsUploaded(false);
      setShowUploadScreen(false);
      setShowChartPicker(false);
      setGlobalData([]);
      setColumns([]);
      setFile(null);
      setAuthStatus(error.response?.data?.message || 'Your session has expired. Please sign in again.');
      return true;
    }
    return false;
  };

  const handleAuth = async (event) => {
    event.preventDefault();
    setAuthStatus('Please wait...');
    try {
      const endpoint = authMode === 'login' ? 'login' : 'register';
      const body = authMode === 'login'
        ? { email: authEmail, password: authPassword }
        : { name: authName, email: authEmail, password: authPassword };
      const response = await axios.post(`${API_BASE_URL}/api/auth/${endpoint}`, body);
      localStorage.setItem('authToken', response.data.token);
      setToken(response.data.token);
      setAuthStatus('');
    } catch (error) {
      setAuthStatus(error.response?.data?.message || 'Unable to authenticate. Please try again.');
    }
  };

  const logout = () => {
    localStorage.removeItem('authToken');
    setToken('');
    setIsUploaded(false);
    setShowUploadScreen(false);
    setShowChartPicker(false);
    setGlobalData([]);
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setUploadStatus('');
    }
  };

  const uploadFile = async (mode = 'merge', skipPrompt = false, fileToUpload = null) => {
    const fileToUse = fileToUpload || file;
    if (!fileToUse) {
      setUploadStatus('Please select an Excel, CSV, or JSON file.');
      return;
    }

    if (isUploaded && !skipPrompt) {
      setPendingFile(fileToUse);
      setShowMergePrompt(true);
      return;
    }

    const formData = new FormData();
    formData.append('file', fileToUse);
    formData.append('mode', mode);
    setUploadStatus('Processing File...');

    try {
      const res = await axios.post(`${API_BASE_URL}/api/upload`, formData, authConfig());
      if (res.status === 200) {
        const isFirstUpload = !isUploaded;
        setFile(null);
        setPendingFile(null);
        setShowMergePrompt(false);
        setUploadStatus(`File uploaded successfully — ${res.data.rows} rows loaded.`);
        setXAxis('');
        setYAxis('');
        await fetchData();
        setIsUploaded(true);
        setShowUploadScreen(false);
        setShowChartPicker(isFirstUpload);
      }
    } catch (err) {
      if (!handleAuthFailure(err)) {
        setUploadStatus(err.response?.data?.message || 'Upload failed. Check backend server.');
      }
    }
  };

  const handleMergeChoice = (mode) => {
    setShowMergePrompt(false);
    const fileToUpload = pendingFile;
    setPendingFile(null);
    setFile(null);
    uploadFile(mode, true, fileToUpload);
  };

  const fetchData = async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/api/data`, authConfig());
      if (res.data && Array.isArray(res.data) && res.data.length > 0) {
        setGlobalData(res.data);

        const allKeys = Array.from(
          new Set(res.data.flatMap((row) => Object.keys(row)))
        ).filter((key) => !['_id', 'userId', 'createdAt', 'updatedAt', '__v'].includes(key));
        setColumns(allKeys);

      }
    } catch (err) {
      if (!handleAuthFailure(err)) {
        console.error('Data Fetch Error:', err);
      }
    }
  };

  const resetUpload = async () => {
    try {
      await axios.post(`${API_BASE_URL}/api/reset`, {}, authConfig());
      setIsUploaded(false);
      setShowUploadScreen(false);
      setShowChartPicker(false);
      setShowMergePrompt(false);
      setPendingFile(null);
      setFile(null);
      setGlobalData([]);
      setColumns([]);
      setXAxis('');
      setYAxis('');
      setUploadStatus('');
    } catch (err) {
      if (!handleAuthFailure(err)) {
        console.error(err);
      }
    }
  };

  const chartColors = [
    '#38bdf8',
    '#818cf8',
    '#34d399',
    '#fbbf24',
    '#f87171',
    '#a855f7',
    '#f472b6',
    '#38cae4'
  ];

  useEffect(() => {
    if (!globalData.length || !columns.length) return;

    const numericColumns = columns.filter((column) => isNumericColumn(globalData, column));
    const defaultY = numericColumns[0] || '';
    const defaultX = columns.find((column) => column !== defaultY && !numericColumns.includes(column))
      || columns.find((column) => column !== defaultY)
      || '';

    setXAxis((current) => (current && columns.includes(current) ? current : defaultX));
    setYAxis((current) => (current && numericColumns.includes(current) ? current : defaultY));
  }, [globalData, columns]);

  const getChartData = () => {
    if (!xAxis || !yAxis || globalData.length === 0) {
      return { labels: [], datasets: [] };
    }

    const labels = globalData.map((row) => {
      const val = row[xAxis];
      return val !== undefined && val !== null ? String(val) : '';
    });

    const values = globalData.map((row) => {
      return toNumber(row[yAxis]) ?? 0;
    });

    if (chartType === 'bubble') {
      return {
        datasets: [
          {
            label: `${yAxis} vs ${xAxis}`,
            data: globalData.map((row, idx) => ({
              x: toNumber(row[xAxis]) ?? idx + 1,
              y: toNumber(row[yAxis]) ?? 0,
              r: 10,
            })),
            backgroundColor: '#38bdf8',
          }
        ]
      };
    }

    return {
      labels,
      datasets: [
        {
          label: `${yAxis} by ${xAxis}`,
          data: values,
          backgroundColor: chartType === 'line' ? 'rgba(56, 189, 248, 0.2)' : chartColors,
          borderColor: '#38bdf8',
          borderWidth: chartType === 'line' ? 3 : 2,
          fill: false,
          tension: 0.3,
          pointBackgroundColor: '#f8fafc',
          pointBorderColor: '#38bdf8',
          pointBorderWidth: chartType === 'line' ? 2 : 0,
          pointRadius: chartType === 'line' ? 4 : 0,
          pointHoverRadius: chartType === 'line' ? 6 : 0,
        }
      ]
    };
  };

  const hasNumericYAxis = yAxis && isNumericColumn(globalData, yAxis);
  const chartRecommendations = getChartRecommendations(globalData, columns, xAxis, yAxis);
  const isPartToWholeChart = chartType === 'pie' || chartType === 'doughnut';

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: {
          color: '#cbd5e1',
          font: { family: 'Inter', size: 12 }
        }
      },
      tooltip: {
        backgroundColor: '#0f172a',
        titleColor: '#38bdf8',
        bodyColor: '#f8fafc',
        borderColor: 'rgba(255,255,255,0.1)',
        borderWidth: 1
      }
    },
    scales:
      chartType === 'pie' || chartType === 'doughnut'
        ? {}
        : {
            x: {
              type: chartType === 'bubble' ? 'linear' : 'category',
              ticks: { color: '#94a3b8' },
              grid: { color: 'rgba(255, 255, 255, 0.05)' }
            },
            y: {
              ticks: { color: '#94a3b8' },
              grid: { color: 'rgba(255, 255, 255, 0.05)' }
            }
          }
  };

  return (
    <div className="app-container">
      {showMergePrompt && (
        <div className="merge-prompt-overlay">
          <div className="merge-prompt-card">
            <h2>Upload Options</h2>
            <p>You already have {globalData.length} rows of data. How would you like to handle the new file?</p>
            <div className="merge-prompt-actions">
              <button className="btn-primary" onClick={() => handleMergeChoice('merge')}>
                Merge with existing data
              </button>
              <button className="btn-danger" onClick={() => handleMergeChoice('replace')}>
                Replace existing data
              </button>
              <button className="btn-secondary" onClick={() => {
                setShowMergePrompt(false);
                setPendingFile(null);
                setFile(null);
              }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      {!token ? (
        <div id="uploadScreen">
          <form className="upload-card auth-card" onSubmit={handleAuth}>
            <h2>Analyst Dashboard</h2>
            <p>{authMode === 'login' ? 'Sign in to access your dashboard.' : 'Create an account to get started.'}</p>
            {authMode === 'register' && (
              <input
                className="auth-input"
                type="text"
                placeholder="Name"
                value={authName}
                onChange={(event) => setAuthName(event.target.value)}
              />
            )}
            <input
              className="auth-input"
              type="email"
              placeholder="Email"
              value={authEmail}
              onChange={(event) => setAuthEmail(event.target.value)}
              autoComplete="email"
              required
            />
            <input
              className="auth-input"
              type="password"
              placeholder="Password"
              value={authPassword}
              onChange={(event) => setAuthPassword(event.target.value)}
              minLength="8"
              autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
              required
            />
            <button className="btn-primary" type="submit">
              {authMode === 'login' ? 'Sign In' : 'Create Account'}
            </button>
            <button className="btn-danger" type="button" onClick={() => {
              setAuthMode(authMode === 'login' ? 'register' : 'login');
              setAuthStatus('');
            }}>
              {authMode === 'login' ? 'Create an account' : 'Already have an account? Sign in'}
            </button>
            <span id="uploadStatus">{authStatus}</span>
          </form>
        </div>
      ) : !isUploaded && showUploadScreen ? (
        <div id="uploadScreen">
          <div className="upload-card">
            <h2>Analyst Dashboard</h2>
            <p>Upload your Excel (.xlsx), CSV (.csv), or JSON file to generate interactive charts.</p>
            <div className="file-drop-area" onClick={() => document.getElementById('fileInput').click()}>
              <span>{file ? file.name : 'Click to browse Excel / CSV / JSON file'}</span>
              <input
                type="file"
                id="fileInput"
                accept=".xlsx, .xls, .csv, .json"
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />
            </div>
            <button className="btn-primary" onClick={uploadFile}>
              Process & Launch
            </button>
            <button className="btn-secondary" onClick={() => setShowUploadScreen(false)}>
              Back to dashboard
            </button>
            <span id="uploadStatus">{uploadStatus}</span>
          </div>
        </div>
      ) : showChartPicker ? (
        <div id="uploadScreen">
          <div className="upload-card chart-picker-card">
            <h2>Choose a chart</h2>
            <p>Select how you want to visualize your uploaded data. You can change this later.</p>
            <div className="chart-picker-grid">
              {[
                ['clusteredBar', 'Clustered Bar Chart', 'Compare values across categories'],
                ['line', 'Line Chart', 'Show changes and trends'],
                ['pie', 'Pie Chart', 'Show category proportions'],
                ['doughnut', 'Doughnut Chart', 'Show category proportions'],
                ['bubble', 'Bubble Chart', 'Compare relationships between values']
              ].map(([type, title, description]) => (
                <button
                  className="chart-picker-option"
                  key={type}
                  onClick={() => {
                    setChartType(type);
                    setShowChartPicker(false);
                  }}
                >
                  <ChartPreview type={type} />
                  <strong>{title}</strong>
                  <span>{description}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div id="dashboardScreen">
          <div className="sidebar">
            <h2>ANALYTICS</h2>
            <div className="total-badge">
              Total Rows Merged: {globalData.length || 0}
            </div>
            {!isUploaded && <button className="btn-primary upload-data-button" onClick={() => setShowUploadScreen(true)}>Upload data</button>}
            <button className="btn-danger" onClick={logout}>Sign Out</button>
            <a href="https://github.com/rajeshrajaram1911-max/analyst-Dashboard" target="_blank" rel="noopener noreferrer" className="github-link">
              View on GitHub
            </a>

            {isUploaded && <div className="menu-group">
              <div className={`menu-item ${chartType === 'clusteredBar' ? 'active' : ''}`} onClick={() => setChartType('clusteredBar')}>Clustered Bar</div>
              <div className={`menu-item ${chartType === 'line' ? 'active' : ''}`} onClick={() => setChartType('line')}>Line Chart</div>
              <div className={`menu-item ${chartType === 'pie' ? 'active' : ''}`} onClick={() => setChartType('pie')}>Pie Chart</div>
              <div className={`menu-item ${chartType === 'doughnut' ? 'active' : ''}`} onClick={() => setChartType('doughnut')}>Doughnut</div>
              <div className={`menu-item ${chartType === 'bubble' ? 'active' : ''}`} onClick={() => setChartType('bubble')}>Bubble Chart</div>
            </div>}

            {isUploaded && <div className="sidebar-action-box">
              <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: '8px' }}>Upload another file. You'll be asked whether to merge or replace the current data:</p>
              <input type="file" accept=".xlsx, .xls, .csv, .json" className="file-input-small" onChange={handleFileChange} />
              <button className="btn-primary" onClick={uploadFile} style={{ marginBottom: '10px' }}>
                Upload new file
              </button>
              <button className="btn-danger" onClick={resetUpload}>
                Clear All Data
              </button>
            </div>}
          </div>

          <div className="main-content">
            {isUploaded && <div className="controls-card">
              <div className="control-group">
                <label>{isPartToWholeChart ? 'Category (slice labels)' : 'X-Axis Property (label column)'}</label>
                <select value={xAxis} onChange={(e) => setXAxis(e.target.value)}>
                  <option value="" disabled>{isPartToWholeChart ? 'Select category column' : 'Select X-axis column'}</option>
                  {columns.map((col) => (
                    <option key={col} value={col}>{col}</option>
                  ))}
                </select>
              </div>

              <div className="control-group">
                <label>{isPartToWholeChart ? 'Value (slice size)' : 'Y-Axis Property (numeric value column)'}</label>
                <select value={yAxis} onChange={(e) => setYAxis(e.target.value)}>
                  <option value="" disabled>{isPartToWholeChart ? 'Select numeric value column' : 'Select Y-axis column'}</option>
                  {columns.map((col) => (
                    <option key={col} value={col}>{col}</option>
                  ))}
                </select>
              </div>
              <p className="control-hint">
                {isPartToWholeChart
                  ? 'Each category becomes a slice. Its numeric value determines the slice size; use this only for a small number of categories.'
                  : chartType === 'bubble'
                    ? 'Choose two numeric columns. X and Y position each bubble to show the relationship between values.'
                    : 'Choose a label column and a numeric value column to build your chart.'}
              </p>
            </div>}

            {isUploaded && chartRecommendations.length > 0 && (
              <section className="smart-recommendations" aria-label="Smart chart recommendations">
                <div>
                  <span className="recommendation-label">SMART RECOMMENDATION</span>
                  <h3>{chartRecommendations[0].title}</h3>
                  <p>{chartRecommendations[0].reason}</p>
                </div>
                <div className="recommendation-actions">
                  {chartRecommendations.map((recommendation) => (
                    <button
                      key={recommendation.type}
                      className={`recommendation-button ${chartType === recommendation.type ? 'selected' : ''}`}
                      onClick={() => setChartType(recommendation.type)}
                      title={recommendation.reason}
                    >
                      Use {recommendation.title}
                    </button>
                  ))}
                </div>
              </section>
            )}

            <div className="chart-card">
              {!isUploaded ? (
                <div className="empty-dashboard">
                  <span className="empty-dashboard-icon">+</span>
                  <h1>Your dashboard is ready</h1>
                  <p>Upload an Excel, CSV, or JSON file to start exploring your data with interactive charts.</p>
                  <button className="btn-primary" onClick={() => setShowUploadScreen(true)}>Upload data</button>
                </div>
              ) : globalData.length > 0 && xAxis && hasNumericYAxis ? (
                <>
                  {chartType === 'clusteredBar' && <Bar data={getChartData()} options={chartOptions} />}
                  {chartType === 'line' && <Line data={getChartData()} options={chartOptions} />}
                  {chartType === 'pie' && <Pie data={getChartData()} options={chartOptions} />}
                  {chartType === 'doughnut' && <Doughnut data={getChartData()} options={chartOptions} />}
                  {chartType === 'bubble' && <Bubble data={getChartData()} options={chartOptions} />}
                </>
              ) : (
                <p style={{ textAlign: 'center', marginTop: '100px', color: '#94a3b8' }}>
                  Select a label column for X-axis and a numeric column for Y-axis to display the chart.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
