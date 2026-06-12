'use client';

import { useEffect, useRef, useCallback } from 'react';
import * as d3 from 'd3';
import { Person, TreeNode } from '@/lib/types';
import { categoryColors } from '@/lib/utils';

interface OrgTreeProps {
  company: { id: string; name: string; industry: string };
  people: Person[];
  onSelectPerson: (person: Person) => void;
  selectedPersonId?: string;
}

function buildTree(company: OrgTreeProps['company'], people: Person[]): TreeNode {
  const byCategory: Record<string, Person[]> = {
    founder: [],
    cto: [],
    engineer: [],
    recruiter: [],
  };

  people.forEach((p) => {
    if (byCategory[p.category]) byCategory[p.category].push(p);
    else byCategory['engineer'].push(p);
  });

  const root: TreeNode = {
    id: company.id,
    name: company.name,
    role: company.industry,
    category: 'company',
    children: [],
  };

  const categoryOrder: Array<keyof typeof byCategory> = ['founder', 'cto', 'engineer', 'recruiter'];
  const categoryLabels: Record<string, string> = {
    founder: 'Founders',
    cto: 'Engineering Leadership',
    engineer: 'Engineering',
    recruiter: 'Recruiting',
  };

  for (const cat of categoryOrder) {
    const group = byCategory[cat];
    if (!group || group.length === 0) continue;

    if (cat === 'engineer' || cat === 'recruiter') {
      // Flatten into leaf nodes directly from founders/cto
      group.forEach((p) => {
        root.children!.push({
          id: p.id,
          name: p.name,
          role: p.role,
          category: p.category,
          data: p,
        });
      });
    } else {
      group.forEach((p) => {
        const node: TreeNode = {
          id: p.id,
          name: p.name,
          role: p.role,
          category: p.category,
          data: p,
          children: [],
        };

        // Attach engineers to founders/CTOs
        if (cat === 'founder' && byCategory['engineer'].length > 0) {
          const slice = byCategory['engineer'].splice(0, Math.ceil(byCategory['engineer'].length / Math.max(group.length, 1)));
          slice.forEach((e) => {
            node.children!.push({
              id: e.id,
              name: e.name,
              role: e.role,
              category: e.category,
              data: e,
            });
          });
        }

        if (cat === 'cto' && byCategory['recruiter'].length > 0) {
          byCategory['recruiter'].forEach((r) => {
            node.children!.push({
              id: r.id,
              name: r.name,
              role: r.role,
              category: r.category,
              data: r,
            });
          });
          byCategory['recruiter'] = [];
        }

        if (node.children!.length === 0) delete node.children;
        root.children!.push(node);
      });
    }
  }

  return root;
}

export default function OrgTree({ company, people, onSelectPerson, selectedPersonId }: OrgTreeProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const draw = useCallback(() => {
    if (!svgRef.current || !containerRef.current || people.length === 0) return;

    const container = containerRef.current;
    const width = container.clientWidth;
    const height = Math.max(500, container.clientHeight);

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    svg
      .attr('width', width)
      .attr('height', height);

    const g = svg.append('g');

    // Zoom
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 2])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });

    svg.call(zoom);

    const treeData = buildTree(company, [...people]);
    const root = d3.hierarchy(treeData);

    const treeLayout = d3.tree<TreeNode>()
      .size([height - 100, width - 300])
      .separation((a, b) => (a.parent === b.parent ? 1.5 : 2));

    treeLayout(root);

    // Initial position — center the tree
    const initialTransform = d3.zoomIdentity
      .translate(120, 50)
      .scale(0.9);
    svg.call(zoom.transform, initialTransform);
    g.attr('transform', initialTransform.toString());

    // Links (curved paths)
    const linkGenerator = d3.linkHorizontal<
      d3.HierarchyLink<TreeNode>,
      d3.HierarchyPointNode<TreeNode>
    >()
      .x((d) => d.y)
      .y((d) => d.x);

    g.selectAll('.tree-link')
      .data(root.links())
      .join('path')
      .attr('class', 'tree-link')
      .attr('d', linkGenerator as any)
      .attr('stroke', 'rgba(139, 115, 85, 0.25)')
      .attr('stroke-width', 1.5)
      .attr('fill', 'none')
      .attr('opacity', 0)
      .transition()
      .duration(600)
      .delay((_, i) => i * 30)
      .attr('opacity', 1);

    // Nodes
    const node = g.selectAll('.tree-node')
      .data(root.descendants())
      .join('g')
      .attr('class', 'tree-node')
      .attr('transform', (d) => `translate(${d.y},${d.x})`)
      .attr('opacity', 0)
      .style('cursor', (d) => d.data.category !== 'company' ? 'pointer' : 'default');

    // Animate nodes in
    node.transition()
      .duration(500)
      .delay((_, i) => i * 60)
      .attr('opacity', 1);

    // Node click
    node.on('click', function (event, d) {
      if (d.data.category !== 'company' && d.data.data) {
        onSelectPerson(d.data.data as Person);
      }
    });

    // Hover
    node.on('mouseenter', function (event, d) {
      if (d.data.category !== 'company') {
        d3.select(this).select('circle')
          .transition().duration(150)
          .attr('r', (d.depth === 0 ? 30 : d.data.category === 'founder' || d.data.category === 'cto' ? 24 : 20))
          .attr('filter', 'url(#glow)');
      }
    }).on('mouseleave', function (event, d) {
      d3.select(this).select('circle')
        .transition().duration(150)
        .attr('r', d.depth === 0 ? 28 : d.data.category === 'founder' || d.data.category === 'cto' ? 22 : 18)
        .attr('filter', null);
    });

    // Glow filter
    const defs = svg.append('defs');
    const filter = defs.append('filter').attr('id', 'glow');
    filter.append('feGaussianBlur').attr('stdDeviation', '4').attr('result', 'coloredBlur');
    const feMerge = filter.append('feMerge');
    feMerge.append('feMergeNode').attr('in', 'coloredBlur');
    feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

    // Circle background glow
    node.append('circle')
      .attr('r', (d) => {
        if (d.depth === 0) return 28;
        if (d.data.category === 'founder' || d.data.category === 'cto') return 22;
        return 18;
      })
      .attr('fill', (d) => {
        const color = categoryColors[d.data.category] || '#A07040';
        return color + '22';
      })
      .attr('stroke', (d) => {
        const isSelected = d.data.id === selectedPersonId;
        const color = categoryColors[d.data.category] || '#A07040';
        return isSelected ? '#4A3B2C' : color;
      })
      .attr('stroke-width', (d) => d.data.id === selectedPersonId ? 2.5 : 1.5);

    // Inner circle
    node.append('circle')
      .attr('r', (d) => {
        if (d.depth === 0) return 16;
        if (d.data.category === 'founder' || d.data.category === 'cto') return 12;
        return 10;
      })
      .attr('fill', (d) => categoryColors[d.data.category] || '#6366f1');

    // Initials text inside circle
    node.append('text')
      .attr('dy', '0.35em')
      .attr('text-anchor', 'middle')
      .attr('fill', 'white')
      .attr('font-size', (d) => d.depth === 0 ? 10 : 8)
      .attr('font-weight', '700')
      .attr('font-family', 'Inter, sans-serif')
      .text((d) => {
        if (d.data.category === 'company') return d.data.name.charAt(0).toUpperCase();
        return d.data.name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase();
      });

    // Name label
    node.append('text')
      .attr('x', (d) => {
        const r = d.depth === 0 ? 32 : d.data.category === 'founder' || d.data.category === 'cto' ? 26 : 22;
        return r;
      })
      .attr('dy', '-0.4em')
      .attr('fill', (d) => d.data.id === selectedPersonId ? '#4A3B2C' : '#3D2E1E')
      .attr('font-size', (d) => d.depth === 0 ? 13 : 11)
      .attr('font-weight', (d) => d.depth === 0 ? '700' : d.data.category === 'founder' || d.data.category === 'cto' ? '600' : '400')
      .attr('font-family', 'Inter, sans-serif')
      .text((d) => d.data.name.length > 20 ? d.data.name.slice(0, 20) + '…' : d.data.name);

    // Role label
    node.append('text')
      .attr('x', (d) => {
        const r = d.depth === 0 ? 32 : d.data.category === 'founder' || d.data.category === 'cto' ? 26 : 22;
        return r;
      })
      .attr('dy', '1em')
      .attr('fill', (d) => categoryColors[d.data.category] || '#8B7355')
      .attr('font-size', 9)
      .attr('font-family', 'Inter, sans-serif')
      .text((d) => d.data.role.length > 28 ? d.data.role.slice(0, 28) + '…' : d.data.role);

  }, [company, people, onSelectPerson, selectedPersonId]);

  useEffect(() => {
    draw();
    const observer = new ResizeObserver(draw);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [draw]);

  if (people.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        No people data available
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full h-full relative">
      <svg ref={svgRef} className="w-full h-full" />
      <div className="absolute bottom-4 right-4 flex flex-col gap-1.5 text-xs" style={{ color: 'var(--muted)' }}>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full inline-block" style={{ background: '#4A3B2C' }} />Company
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full inline-block" style={{ background: '#A07040' }} />Founders
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full inline-block" style={{ background: '#7A7040' }} />CTO / VP Eng
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full inline-block" style={{ background: '#407A70' }} />Engineering
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full inline-block" style={{ background: '#7A407A' }} />Recruiting
        </span>
      </div>
      <div className="absolute bottom-4 left-4 text-xs" style={{ color: 'var(--border)' }}>
        Scroll to zoom · Drag to pan · Click to select
      </div>
    </div>
  );
}
