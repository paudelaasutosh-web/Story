import React from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from 'recharts';
import { StoryStats } from '../types';

interface StoryDNAProps {
  statsHistory: StoryStats[];
  currentStats: StoryStats;
}

const StoryDNA: React.FC<StoryDNAProps> = ({ statsHistory, currentStats }) => {
  const radarData = [
    { subject: 'Tension', A: currentStats.tension, fullMark: 100 },
    { subject: 'Mystery', A: currentStats.mystery, fullMark: 100 },
    { subject: 'Romance', A: currentStats.romance, fullMark: 100 },
    { subject: 'Hope', A: currentStats.hope, fullMark: 100 },
  ];

  return (
    <div className="space-y-8 font-serif">
      <div>
        <h3 className="text-xs font-bold text-[#8b4513] mb-2 uppercase tracking-widest border-b border-[#8b4513]/10 pb-1">Emotional Arc</h3>
        <div className="h-32 w-full -ml-2">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={statsHistory}>
              <Line type="monotone" dataKey="tension" stroke="#8b4513" strokeWidth={1.5} dot={false} />
              <Line type="monotone" dataKey="hope" stroke="#2f855a" strokeWidth={1.5} dot={false} />
              <Line type="monotone" dataKey="romance" stroke="#d53f8c" strokeWidth={1.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div>
        <h3 className="text-xs font-bold text-[#8b4513] mb-2 uppercase tracking-widest border-b border-[#8b4513]/10 pb-1">Atmosphere</h3>
        <div className="h-40 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
              <PolarGrid stroke="#bcaaa4" />
              <PolarAngleAxis dataKey="subject" tick={{ fill: '#5d4037', fontSize: 9, fontFamily: 'serif' }} />
              <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
              <Radar
                name="Atmosphere"
                dataKey="A"
                stroke="#5d4037"
                strokeWidth={1}
                fill="#8d6e63"
                fillOpacity={0.4}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default StoryDNA;