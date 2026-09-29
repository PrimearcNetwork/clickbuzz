import { useState } from 'react';
import { Check, X } from 'lucide-react';

// Custom Toggle Component matching the reference UI
const CustomToggle = ({ isOn, onToggle }) => (
  <button 
    onClick={onToggle}
    className={`w-14 h-7 rounded-full relative transition-colors duration-300 flex items-center ${isOn ? 'bg-[#22c55e]' : 'bg-[#475569]'}`}
  >
    <div className={`w-6 h-6 rounded-full bg-white absolute top-0.5 transition-transform duration-300 flex items-center justify-center ${isOn ? 'translate-x-7' : 'translate-x-0.5'}`}>
      {isOn ? <Check size={14} className="text-[#22c55e]" strokeWidth={3} /> : <X size={14} className="text-gray-400" strokeWidth={3} />}
    </div>
  </button>
);

const AdminAboutUs = () => {
  const [fields, setFields] = useState([
    { id: 'version', label: 'version', value: '1.0.1', isLong: false, status: true },
    { id: 'company_name', label: 'company_name', value: 'Dream Stream Limited', isLong: false, status: true },
    { id: 'email', label: 'email', value: 'contact@clickbuz.com', isLong: false, status: true },
    { id: 'website', label: 'website', value: 'https://clickbuz.com', isLong: false, status: true },
    { id: 'contact', label: 'contact', value: '+1 (555) 123-4567 (9 AM to 5 PM)', isLong: false, status: true },
    { id: 'about_us', label: 'about_us', value: 'ClickBuz is a premium streaming destination dedicated to providing the finest range of cinematic content across all categories.', isLong: true, status: true },
  ]);

  const toggleStatus = (id) => {
    setFields(fields.map(f => f.id === id ? { ...f, status: !f.status } : f));
  };

  const updateValue = (id, newValue) => {
    setFields(fields.map(f => f.id === id ? { ...f, value: newValue } : f));
  };

  const handleSave = () => {
    // Save logic would go here
    alert("Changes saved successfully!");
  };

  return (
    <div className="w-full flex flex-col">
      {/* Header Area */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <h2 className="text-lg md:text-xl font-bold text-white tracking-wider uppercase">ABOUT US LISTING</h2>
        <button 
          onClick={handleSave}
          className="w-full sm:w-auto px-6 py-2 rounded-lg bg-[#22c55e] text-white font-bold hover:bg-[#16a34a] transition-colors shadow-lg shadow-green-500/20"
        >
          Save Changes
        </button>
      </div>

      {/* List Area */}
      <div className="bg-[#141a29] rounded-xl border border-gray-800 overflow-hidden shadow-2xl flex flex-col">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left text-sm text-gray-300 min-w-[600px]">
            <thead className="bg-[#1e293b]/80 border-b border-gray-800 text-gray-300 font-semibold text-xs tracking-wider">
              <tr>
                <th className="px-8 py-5 w-1/4">Field</th>
                <th className="px-8 py-5 w-2/4">Value</th>
                <th className="px-8 py-5 w-1/4 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/50">
              {fields.map((field) => (
                <tr key={field.id} className="hover:bg-[#1e2638]/50 transition-colors">
                  <td className="px-8 py-6 font-medium text-white align-top pt-8">{field.label}</td>
                  <td className="px-8 py-6">
                    {field.isLong ? (
                      <textarea 
                        value={field.value}
                        onChange={(e) => updateValue(field.id, e.target.value)}
                        className="w-full bg-[#3b82f6]/20 border-none text-[#4aa5ff] rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-[#3b82f6]/50 font-medium transition-all min-h-[100px] resize-none"
                      />
                    ) : (
                      <input 
                        type="text" 
                        value={field.value}
                        onChange={(e) => updateValue(field.id, e.target.value)}
                        className="w-full bg-[#3b82f6]/20 border-none text-[#4aa5ff] rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-[#3b82f6]/50 font-medium transition-all"
                      />
                    )}
                  </td>
                  <td className="px-8 py-6 align-top pt-8">
                    <div className="flex justify-center">
                      <CustomToggle isOn={field.status} onToggle={() => toggleStatus(field.id)} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AdminAboutUs;
