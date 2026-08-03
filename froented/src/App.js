import React, { useState } from 'react';
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
  Legend
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
  Legend
);

function App() {
  const [file, setFile] = useState(null);
  const [uploadStatus, setUploadStatus] = useState('');
  const [isUploaded, setIsUploaded] = useState(false);
  const [globalData, setGlobalData] = useState([]);
  const [columns, setColumns] = useState([]);
  const [xAxis, setXAxis] = useState('');
  const [yAxis, setYAxis] = useState('');
  const [chartType, setChartType] = useState('bar');

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const uploadFile = async () => {
    if (!file) {
      setUploadStatus('Please select an Excel, CSV, or JSON file.');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);
    setUploadStatus('Processing File...');

    try {
      const res = await axios.post('https://analyst-dashboard-live.onrender.com/api/upload', formData);
      if (res.status === 200) {
        setFile(null);
        setUploadStatus('File Uploaded Successfully!');
        await fetchData();
        setIsUploaded(true);
      }
    } catch (err) {
      setUploadStatus('Upload failed. Check backend server.');
    }
  };

  const fetchData = async () => {
    try {
      const res = await axios.get('https://analyst-dashboard-live.onrender.com/api/data');
      if (res.data && Array.isArray(res.data) && res.data.length > 0) {
        setGlobalData(res.data);

        const allKeys = Array.from(
          new Set(res.data.flatMap((row) => Object.keys(row)))
        );
        setColumns(allKeys);

        setXAxis((prevX) => (prevX && allKeys.includes(prevX) ? prevX : allKeys[0] || ''));
        setYAxis((prevY) => (prevY && allKeys.includes(prevY) ? prevY : allKeys[1] || allKeys[0] || ''));
      }
    } catch (err) {
      console.error('Data Fetch Error:', err);
    }
  };

  const resetUpload = async () => {
    try {
      await axios.post('https://analyst-dashboard-live.onrender.com/api/reset');
      setIsUploaded(false);
      setFile(null);
      setGlobalData([]);
      setColumns([]);
      setXAxis('');
      setYAxis('');
      setUploadStatus('');
    } catch (err) {
      console.error(err);
    }
  };

  const chartColors = [
    '#38bdf8', '#818cf8', '#34d399', '#fbbf24',
    '#f87171', '#a855f7', '#f472b6', '#38cae4'
  ];

  const getChartData = () => {
    if (!xAxis || !yAxis || globalData.length === 0) {
      return { labels: [], datasets: [] };
    }

    const labels = globalData.map((row) => {
      const val = row[xAxis];
      return val !== undefined && val !== null ? String(val) : '';
    });

    const values = globalData.map((row) => {
      const val = row[yAxis];
      const num = Number(val);
      return isNaN(num) ? 0 : num;
    });

    if (chartType === 'bubble') {
      return {
        datasets: [
          {
            label: `${yAxis} vs ${xAxis}`,
            data: globalData.map((row, idx) => ({
              x: idx,
              y: Number(row[yAxis]) || 0,
              r: 10
            })),
            backgroundColor: '#38bdf8'
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
          borderWidth: 2,
          fill: chartType === 'line',
          tension: 0.3
        }
      ]
    };
  };

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
      {!isUploaded ? (
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
            <span id="uploadStatus">{uploadStatus}</span>
          </div>
        </div>
      ) : (
        <div id="dashboardScreen">
          <div className="sidebar">
            <h2>ANALYTICS</h2>
            <div className="total-badge">
              Total Rows Merged: {globalData.length}
            </div>

            <div className="menu-group">
              <div className={`menu-item ${chartType === 'bar' ? 'active' : ''}`} onClick={() => setChartType('bar')}>Bar Chart</div>
              <div className={`menu-item ${chartType === 'line' ? 'active' : ''}`} onClick={() => setChartType('line')}>Line Chart</div>
              <div className={`menu-item ${chartType === 'pie' ? 'active' : ''}`} onClick={() => setChartType('pie')}>Pie Chart</div>
              <div className={`menu-item ${chartType === 'doughnut' ? 'active' : ''}`} onClick={() => setChartType('doughnut')}>Doughnut</div>
              <div className={`menu-item ${chartType === 'bubble' ? 'active' : ''}`} onClick={() => setChartType('bubble')}>Bubble Chart</div>
            </div>

            <div className="sidebar-action-box">
              <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: '8px' }}>Merge Another File:</p>
              <input type="file" accept=".xlsx, .xls, .csv, .json" className="file-input-small" onChange={handleFileChange} />
              <button className="btn-primary" onClick={uploadFile} style={{ marginBottom: '10px' }}>
                + Add / Merge File
              </button>
              <button className="btn-danger" onClick={resetUpload}>
                Clear All Data
              </button>
            </div>
          </div>

          <div className="main-content">
            <div className="controls-card">
              <div className="control-group">
                <label>X-Axis Property (Label Column)</label>
                <select value={xAxis} onChange={(e) => setXAxis(e.target.value)}>
                  {columns.map((col) => (
                    <option key={col} value={col}>{col}</option>
                  ))}
                </select>
              </div>

              <div className="control-group">
                <label>Y-Axis Property (Value Column)</label>
                <select value={yAxis} onChange={(e) => setYAxis(e.target.value)}>
                  {columns.map((col) => (
                    <option key={col} value={col}>{col}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="chart-card">
              {globalData.length > 0 && xAxis && yAxis ? (
                <>
                  {chartType === 'bar' && <Bar data={getChartData()} options={chartOptions} />}
                  {chartType === 'line' && <Line data={getChartData()} options={chartOptions} />}
                  {chartType === 'pie' && <Pie data={getChartData()} options={chartOptions} />}
                  {chartType === 'doughnut' && <Doughnut data={getChartData()} options={chartOptions} />}
                  {chartType === 'bubble' && <Bubble data={getChartData()} options={chartOptions} />}
                </>
              ) : (
                <p style={{ textAlign: 'center', marginTop: '100px', color: '#94a3b8' }}>
                  No data available to display chart.
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