import { useState, useEffect, useRef } from 'react'
import './App.css'

// 請替換為您剛部署的 Google Apps Script 網頁應用程式 URL
const GAS_URL = 'YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL'

// 將時間轉為 .ics 需要的格式 (YYYYMMDDThhmmssZ)
const formatICSDate = (dateString) => {
  if (!dateString) return ''
  const d = new Date(dateString)
  return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
}

// 解析 .ics 時間 (YYYYMMDDThhmmssZ 轉為 YYYY-MM-DDTHH:mm)
const parseICSDate = (icsDate) => {
  if (!icsDate) return ''
  icsDate = icsDate.trim()
  const y = icsDate.substring(0, 4)
  const m = icsDate.substring(4, 6)
  const d = icsDate.substring(6, 8)
  const h = icsDate.substring(9, 11) || '00'
  const min = icsDate.substring(11, 13) || '00'
  return `${y}-${m}-${d}T${h}:${min}`
}

// 取得該月有幾天
const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
// 取得該月第一天是星期幾
const getFirstDayOfMonth = (year, month) => new Date(year, month, 1).getDay();

// 產生行事曆的陣列資料
const generateCalendar = (currentDate) => {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  
  const days = [];
  for (let i = 0; i < firstDay; i++) {
    days.push(null); // 填補1號之前的空白格子
  }
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(new Date(year, month, i));
  }
  return days;
};

// 預設分類顏色，若無則自動產生雜湊顏色
const categoryColors = {
  '預設': '#efebce',
  '工作': '#d6ce93',
  '個人': '#d8a48f',
  '重要': '#bb8588',
  '其他': '#a3a380',
};

// 動態產生的莫蘭迪色系調色盤
const morandiPalette = [
  '#a3a380', '#d6ce93', '#d8a48f', '#bb8588', '#bca2a2', 
  '#a8b4a5', '#b5c4b1', '#c8b8a6', '#a3b1c6', '#c1b2c2', 
  '#cbb4a1', '#8f9e9d', '#9c9695', '#d2bba0'
];

const getCategoryColor = (cat) => {
  if (categoryColors[cat]) return categoryColors[cat];
  let hash = 0;
  for (let i = 0; i < cat.length; i++) {
    hash = cat.charCodeAt(i) + ((hash << 5) - hash);
  }
  return morandiPalette[Math.abs(hash) % morandiPalette.length];
}

function App() {
  const [events, setEvents] = useState([])
  const [categories, setCategories] = useState(['預設', '工作', '個人'])
  const [newCategory, setNewCategory] = useState('')
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    title: '', start: '', end: '', category: '預設', description: ''
  })
  const [currentDate, setCurrentDate] = useState(new Date())
  // 使用 useRef 避免在 setInterval 中取到舊的 categories
  const categoriesRef = useRef(categories)
  useEffect(() => { categoriesRef.current = categories }, [categories])

  // 從 Google Sheets 獲取資料
  const fetchEvents = async () => {
    if (GAS_URL === 'YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL') return;
    try {
      const res = await fetch(GAS_URL)
      const data = await res.json()
      setEvents(data)
      // 自動匯入表單中未出現的分類
      const existingCats = new Set(categoriesRef.current)
      data.forEach(ev => existingCats.add(ev.category))
      setCategories(Array.from(existingCats))
    } catch (err) {
      console.error('載入失敗:', err)
    }
  }

  // 初始化時從 Google Sheets 載入資料，並設定定期輪詢 (Polling) 以達到雙向即時更新
  useEffect(() => {
    if (GAS_URL === 'YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL') return;
    setLoading(true)
    fetchEvents().finally(() => setLoading(false))

    // 每 15 秒向 Google Sheets 請求一次最新資料
    const intervalId = setInterval(() => {
      fetchEvents()
    }, 15000)

    return () => clearInterval(intervalId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 同步資料至 Google Sheets
  const syncToSheets = async (updatedEvents) => {
    if (GAS_URL === 'YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL') {
      console.warn('尚未設定 Google Apps Script URL，資料僅保留在本地端，重新整理後會消失。')
      return
    }
    setLoading(true)
    try {
      await fetch(GAS_URL, {
        method: 'POST',
        // 使用 text/plain 繞過 CORS Preflight
        body: JSON.stringify(updatedEvents)
      })
    } catch (err) {
      console.error('同步失敗:', err)
    }
    setLoading(false)
  }

  // 處理表單變更
  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData({ ...formData, [name]: value })
  }

  // 新增事項
  const handleAddEvent = (e) => {
    e.preventDefault()
    const newEvent = { ...formData, id: Date.now().toString() }
    const updatedEvents = [...events, newEvent]
    setEvents(updatedEvents)
    syncToSheets(updatedEvents)
    setFormData({ title: '', start: '', end: '', category: categories[0], description: '' })
  }

  // 新增分類
  const handleAddCategory = () => {
    if (newCategory.trim() && !categories.includes(newCategory.trim())) {
      setCategories([...categories, newCategory.trim()])
      setNewCategory('')
    }
  }

  // 刪除事項
  const handleDelete = (id) => {
    const updatedEvents = events.filter(ev => ev.id !== id)
    setEvents(updatedEvents)
    syncToSheets(updatedEvents)
  }

  const prevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))
  }
  
  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))
  }

  // 匯出 ICS 檔案
  const handleExportICS = () => {
    let icsContent = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//My Calendar//EN\r\n'
    events.forEach(ev => {
      icsContent += 'BEGIN:VEVENT\r\n'
      icsContent += `UID:${ev.id}\r\n`
      if(ev.start) icsContent += `DTSTART:${formatICSDate(ev.start)}\r\n`
      if(ev.end) icsContent += `DTEND:${formatICSDate(ev.end)}\r\n`
      icsContent += `SUMMARY:${ev.title}\r\n`
      icsContent += `CATEGORIES:${ev.category}\r\n`
      icsContent += `DESCRIPTION:${ev.description}\r\n`
      icsContent += 'END:VEVENT\r\n'
    })
    icsContent += 'END:VCALENDAR\r\n'

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = 'calendar-events.ics'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // 匯入 ICS 檔案
  const handleImportICS = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (evt) => {
      const lines = evt.target.result.split(/\r?\n/)
      const importedEvents = []
      let currentEvent = null

      lines.forEach(line => {
        if (line.startsWith('BEGIN:VEVENT')) {
          currentEvent = { id: Date.now() + Math.random().toString().substring(2, 6) }
        } else if (line.startsWith('END:VEVENT')) {
          if (currentEvent && currentEvent.title) importedEvents.push(currentEvent)
          currentEvent = null
        } else if (currentEvent) {
          if (line.startsWith('SUMMARY:')) currentEvent.title = line.substring(8).trim()
          else if (line.startsWith('DTSTART')) currentEvent.start = parseICSDate(line.substring(line.indexOf(':') + 1))
          else if (line.startsWith('DTEND')) currentEvent.end = parseICSDate(line.substring(line.indexOf(':') + 1))
          else if (line.startsWith('CATEGORIES:')) currentEvent.category = line.substring(11).trim()
          else if (line.startsWith('DESCRIPTION:')) currentEvent.description = line.substring(12).trim()
        }
      })

      // 過濾掉與現有行程「標題與開始時間」完全相同的重複事項
      const existingKeys = new Set(events.map(ev => `${ev.title}-${ev.start}`))
      const uniqueImportedEvents = importedEvents.filter(ev => !existingKeys.has(`${ev.title}-${ev.start}`))

      // 更新現有分類
      const newCats = new Set(categories)
      uniqueImportedEvents.forEach(ev => {
        if (ev.category) newCats.add(ev.category)
      })
      setCategories(Array.from(newCats))

      const updatedEvents = [...events, ...uniqueImportedEvents]
      setEvents(updatedEvents)
      syncToSheets(updatedEvents)
    }
    reader.readAsText(file)
    e.target.value = '' // 清除 input 讓下次同檔案也能觸發
  }

  const calendarDays = generateCalendar(currentDate);

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '20px', textAlign: 'left', fontFamily: 'sans-serif' }}>
      <h1 style={{ textAlign: 'center' }}>📅 行事曆管理系統</h1>

      <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', marginBottom: '20px' }}>
        <div style={{ flex: 1, minWidth: '300px', padding: '20px', backgroundColor: '#f9f9f9', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
          <h3 style={{ marginTop: 0 }}>🏷️ 新增分類</h3>
          <div style={{ display: 'flex', gap: '10px' }}>
            <input type="text" value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="輸入新分類名稱" style={{ flex: 1, padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }} />
            <button type="button" onClick={handleAddCategory} style={{ padding: '8px 16px', borderRadius: '4px', border: 'none', backgroundColor: '#84a59d', color: 'white', cursor: 'pointer' }}>新增分類</button>
          </div>
        </div>

        <form onSubmit={handleAddEvent} style={{ flex: 2, minWidth: '300px', display: 'flex', flexDirection: 'column', gap: '10px', padding: '20px', backgroundColor: '#f9f9f9', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
          <h3 style={{ marginTop: 0 }}>📝 新增行程</h3>
          <input type="text" name="title" value={formData.title} onChange={handleChange} placeholder="事項標題" required style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }} />
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <input type="datetime-local" name="start" value={formData.start} onChange={handleChange} required style={{ flex: 1, padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }} />
            <input type="datetime-local" name="end" value={formData.end} onChange={handleChange} required style={{ flex: 1, padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }} />
          </div>
          <select name="category" value={formData.category} onChange={handleChange} style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}>
            {categories.map((cat, idx) => <option key={idx} value={cat}>{cat}</option>)}
          </select>
          <textarea name="description" value={formData.description} onChange={handleChange} placeholder="事項描述" style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ccc', resize: 'vertical' }}></textarea>
          <button type="submit" disabled={loading} style={{ padding: '10px', borderRadius: '4px', border: 'none', backgroundColor: '#84a59d', color: 'white', cursor: 'pointer', fontWeight: 'bold' }}>{loading ? '同步中...' : '新增並儲存'}</button>
        </form>
      </div>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', justifyContent: 'flex-end' }}>
        <button onClick={handleExportICS} style={{ padding: '8px 16px', borderRadius: '4px', border: '1px solid #ccc', backgroundColor: '#fff', cursor: 'pointer' }}>⬇️ 匯出 .ics</button>
        <label style={{ cursor: 'pointer', padding: '8px 16px', backgroundColor: '#fff', border: '1px solid #ccc', borderRadius: '4px', color: '#333' }}>
          ⬆️ 匯入 .ics
          <input type="file" accept=".ics" onChange={handleImportICS} style={{ display: 'none' }} />
        </label>
      </div>

      {loading && <p>資料同步中...</p>}

      <div style={{ backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', padding: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
          <button onClick={prevMonth} style={{ padding: '8px 16px', border: 'none', borderRadius: '4px', backgroundColor: '#f6bd60', color: '#fff', cursor: 'pointer', fontWeight: 'bold' }}>◀ 上個月</button>
          <h2 style={{ margin: 0 }}>{currentDate.getFullYear()} 年 {currentDate.getMonth() + 1} 月</h2>
          <button onClick={nextMonth} style={{ padding: '8px 16px', border: 'none', borderRadius: '4px', backgroundColor: '#f6bd60', color: '#fff', cursor: 'pointer', fontWeight: 'bold' }}>下個月 ▶</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '1px', backgroundColor: '#f5cac3', border: '1px solid #f5cac3', borderRadius: '8px', overflow: 'hidden' }}>
          {['日', '一', '二', '三', '四', '五', '六'].map(d => (
            <div key={d} style={{ backgroundColor: '#f7ede2', textAlign: 'center', padding: '10px', fontWeight: 'bold', color: '#84a59d' }}>{d}</div>
          ))}
          {calendarDays.map((day, idx) => (
            <div key={idx} style={{ backgroundColor: day ? '#fff' : '#f7ede2', minHeight: '120px', padding: '5px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {day ? (
                <>
                  <div style={{ textAlign: 'right', fontWeight: 'bold', color: day.toDateString() === new Date().toDateString() ? '#f28482' : '#333', marginBottom: '4px' }}>
                    {day.getDate()}
                  </div>
                  {events.filter(ev => {
                    if (!ev.start) return false;
                    const evDate = new Date(ev.start);
                    return evDate.getFullYear() === day.getFullYear() && evDate.getMonth() === day.getMonth() && evDate.getDate() === day.getDate();
                  }).map(ev => (
                    <div key={ev.id} style={{ backgroundColor: getCategoryColor(ev.category), padding: '4px 6px', borderRadius: '6px', fontSize: '0.85em', position: 'relative', cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }} title={ev.description}>
                      <div style={{ fontWeight: 'bold', color: '#333', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', paddingRight: '15px' }}>{ev.title}</div>
                      <div style={{ fontSize: '0.8em', color: '#666' }}>{new Date(ev.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                      <button onClick={() => handleDelete(ev.id)} style={{ position: 'absolute', top: '4px', right: '4px', background: 'transparent', border: 'none', color: '#f28482', cursor: 'pointer', padding: 0, fontSize: '12px', lineHeight: '1', fontWeight: 'bold' }}>✖</button>
                    </div>
                  ))}
                </>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default App
